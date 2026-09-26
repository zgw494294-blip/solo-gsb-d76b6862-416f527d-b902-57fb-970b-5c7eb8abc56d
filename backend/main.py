"""装配尺寸链校验台 —— FastAPI 后端。

路由：
  POST /api/analyze   录入数据校验 + 一致性检查（矛盾时返回一条负权闭环）
  POST /api/query     两点间隙查询（一致时给出最紧界与合格判定）
  POST /api/simplify  测量清单精简（一致时给出保留/可删编号与见证；矛盾时只返回负环）
  POST /api/tolerance 测量容差预算（按编号步长放宽区间，求使清单首次一致的最小 k）
  POST /api/coordinate-fit 名义坐标拟合（最小化最大绝对偏差 D，再取字典序最小解；
                          矛盾时只返回负环）
  POST /api/reading-window 补测读数窗口（拟补一条精确测量 [r,r]，求使清单一致且
                          目标点对最紧界有界并完全落入合格区间的全部极大整数区间；
                          矛盾时只返回负环，无窗口时明确无可用读数）
  POST /api/shim-plan    垫片组合选配（每位恰选一个选项，有符号厚度和只整体平移
                          目标点对最紧区间；先最低成本、并列取选项序号向量字典序最小；
                          矛盾时只返回负环，无界/无解时明确提示）
  POST /api/chain-impact 尺寸链改动影响（基线与编辑稿两版分别沿用现有校验；
                          基准点名称和顺序须相同，测量可增删改；两版均一致时逐有序
                          异点对比较最紧上下界与无界状态，仅返回发生变化的点对；
                          任一版矛盾时返回各矛盾版本的负环，不生成点对差异）
  POST /api/min-removal 矛盾测量最小撤回（沿用现有点和测量校验；接收可撤回编号
                          列表，至多 16 条，未知或重复编号报错；原清单一致时返回
                          空撤回集；矛盾时只允许删除可撤回测量，求使剩余清单一致
                          的最少删除条数，并列时按原录入顺序取删除序号列表字典序
                          最小者；锁定测量自身矛盾时返回不可修复及锁定部分负环）
  POST /api/inspection-order 测量复核排程（从当前清单选取 1～16 条测量，为每条
                          设置复核耗时、独立不合格概率（‰）与必须先复核的测量
                          编号；依赖只能引用所选测量，成环报错；复核遇首条不合格
                          即停止，求满足依赖且预期总耗时最小的完整顺序，并列时
                          按原录入位置的序号向量取字典序最小者；返回顺序、每步
                          执行概率与预期总耗时，概率与期望值以精确分数计算，
                          不枚举全部排列）
静态：GET /         前端页面（static/index.html）
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, StrictInt, ValidationError

from . import solver

app = FastAPI(title="装配尺寸链校验台", version="1.0.0")


class ConstraintIn(BaseModel):
    id: str | None = None
    from_point: str | None = None
    to_point: str | None = None
    low: StrictInt | None = None
    high: StrictInt | None = None

    model_config = {"extra": "ignore"}


class AnalyzeIn(BaseModel):
    points: list[str]
    constraints: list[ConstraintIn]

    model_config = {"extra": "ignore"}


class QueryIn(BaseModel):
    points: list[str]
    constraints: list[ConstraintIn]
    from_point: str
    to_point: str
    target_low: StrictInt
    target_high: StrictInt

    model_config = {"extra": "ignore"}


class ReadingWindowIn(BaseModel):
    points: list[str]
    constraints: list[ConstraintIn]
    from_point: str
    to_point: str
    target_from: str
    target_to: str
    target_low: StrictInt
    target_high: StrictInt

    model_config = {"extra": "ignore"}


class ShimOptionIn(BaseModel):
    thickness: StrictInt
    cost: StrictInt

    model_config = {"extra": "ignore"}


class ShimPositionIn(BaseModel):
    direction: StrictInt
    options: list[ShimOptionIn]

    model_config = {"extra": "ignore"}


class ShimPlanIn(BaseModel):
    points: list[str]
    constraints: list[ConstraintIn]
    target_from: str
    target_to: str
    target_low: StrictInt
    target_high: StrictInt
    positions: list[ShimPositionIn]

    model_config = {"extra": "ignore"}


def _payload(raw: dict) -> dict:
    """Pydantic 字段 from/to 转 from_point/to_point（from 是 Python 关键字）。"""
    constraints = []
    for c in raw.get("constraints", []) if isinstance(raw, dict) else []:
        if not isinstance(c, dict):
            constraints.append({})
            continue
        constraints.append({
            "id": c.get("id"),
            "from_point": c.get("from"),
            "to_point": c.get("to"),
            "low": c.get("low"),
            "high": c.get("high"),
        })
    return {"points": (raw.get("points", []) if isinstance(raw, dict) else []),
            "constraints": constraints}


def _field_label(loc: tuple) -> str:
    mapping = {
        "points": "基准点",
        "constraints": "测量约束",
        "from_point": "起点",
        "to_point": "终点",
        "target_from": "目标起点",
        "target_to": "目标终点",
        "low": "下限",
        "high": "上限",
        "target_low": "目标下限",
        "target_high": "目标上限",
        "id": "编号",
        "positions": "安装位",
        "direction": "方向",
        "options": "选项",
        "thickness": "厚度",
        "cost": "成本",
    }
    raw = list(loc)
    labels: list[str] = []
    for k, p in enumerate(raw):
        if p == "body":
            continue
        if isinstance(p, int):
            # 下标本身已渲染为“第 N 个安装位/选项”，跳过紧随的容器名单词
            if k >= 1 and raw[k - 1] == "positions":
                labels.append(f"第 {p + 1} 个安装位")
            elif k >= 1 and raw[k - 1] == "options":
                labels.append(f"第 {p + 1} 个选项")
            else:
                labels.append(f"第 {p + 1} 项")
        else:
            name = mapping.get(str(p), str(p))
            # “positions / options”由其后的下标短语表达，不再单独拼一次
            if (p in ("positions", "options") and k + 1 < len(raw)
                    and isinstance(raw[k + 1], int)):
                continue
            labels.append(name)
    if labels and labels[0] == "测量约束" and len(labels) >= 2:
        try:
            labels[1] = f"第 {int(raw[1]) + 1} 条"
        except (ValueError, IndexError):
            pass
    return "・".join(labels) if labels else "请求体"


def _validation_messages(exc: ValidationError) -> list[str]:
    msgs = []
    for err in exc.errors():
        label = _field_label(err["loc"])
        etype = err["type"]
        if etype in ("int_type", "int_parsing", "int_from_float"):
            msgs.append(f"{label}：必须为整数")
        elif etype == "missing":
            msgs.append(f"{label}：缺少该字段")
        elif etype == "string_type":
            msgs.append(f"{label}：必须为字符串")
        elif etype == "list_type":
            msgs.append(f"{label}：必须为数组")
        else:
            msgs.append(f"{label}：{err['msg']}")
    return msgs


def _prepare(raw: dict) -> tuple[list[str], list[dict]]:
    model = AnalyzeIn(**_payload(raw))
    payload = {
        "points": model.points,
        "constraints": [
            {"id": c.id, "from": c.from_point, "to": c.to_point,
             "low": c.low, "high": c.high}
            for c in model.constraints
        ],
    }
    return solver.validate(payload)


@app.post("/api/analyze")
async def analyze(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    return solver.analyze(points, constraints)


@app.post("/api/query")
async def query(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        model = QueryIn(**{**_payload(raw),
                           "from_point": raw.get("from"),
                           "to_point": raw.get("to"),
                           "target_low": raw.get("targetLow"),
                           "target_high": raw.get("targetHigh")})
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})

    payload = {
        "points": model.points,
        "constraints": [
            {"id": c.id, "from": c.from_point, "to": c.to_point,
             "low": c.low, "high": c.high}
            for c in model.constraints
        ],
    }
    try:
        points, constraints = solver.validate(payload)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})

    # 查询点存在性 / 异同 / 目标区间合法性
    errors = []
    if model.from_point.strip() not in points:
        errors.append(f"起点 {model.from_point} 尚未录入")
    if model.to_point.strip() not in points:
        errors.append(f"终点 {model.to_point} 尚未录入")
    if model.from_point.strip() == model.to_point.strip():
        errors.append("间隙查询的两个点必须不同")
    if model.target_low > model.target_high:
        errors.append(
            f"目标合格区间下限 {model.target_low} 大于上限 {model.target_high}")
    if abs(model.target_low) > solver.LIMIT_RANGE or abs(model.target_high) > solver.LIMIT_RANGE:
        errors.append(f"目标合格区间上下限须在 ±{solver.LIMIT_RANGE} 以内")
    if errors:
        return JSONResponse(status_code=400, content={"detail": errors})

    analysis = solver.analyze(points, constraints)
    if not analysis["consistent"]:
        return JSONResponse(status_code=409,
                            content={"detail": "约束系统存在矛盾闭环，不输出间隙结果",
                                     "analysis": analysis})

    result = solver.query(analysis, model.from_point.strip(), model.to_point.strip(),
                          model.target_low, model.target_high)
    return result


@app.post("/api/reading-window")
async def reading_window(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        model = ReadingWindowIn(**{**_payload(raw),
                                   "from_point": raw.get("from"),
                                   "to_point": raw.get("to"),
                                   "target_from": raw.get("targetFrom"),
                                   "target_to": raw.get("targetTo"),
                                   "target_low": raw.get("targetLow"),
                                   "target_high": raw.get("targetHigh")})
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})

    payload = {
        "points": model.points,
        "constraints": [
            {"id": c.id, "from": c.from_point, "to": c.to_point,
             "low": c.low, "high": c.high}
            for c in model.constraints
        ],
    }
    try:
        points, constraints = solver.validate(payload)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})

    # 补测点对 / 目标点对存在性、异同与目标区间合法性（沿用查询接口的校验口径）
    errors = []
    if model.from_point.strip() not in points:
        errors.append(f"补测起点 {model.from_point} 尚未录入")
    if model.to_point.strip() not in points:
        errors.append(f"补测终点 {model.to_point} 尚未录入")
    if model.from_point.strip() and model.from_point.strip() == model.to_point.strip():
        errors.append("拟补测的两个基准点必须不同")
    if model.target_from.strip() not in points:
        errors.append(f"目标起点 {model.target_from} 尚未录入")
    if model.target_to.strip() not in points:
        errors.append(f"目标终点 {model.target_to} 尚未录入")
    if model.target_from.strip() and model.target_from.strip() == model.target_to.strip():
        errors.append("目标点对的两个点必须不同")
    if model.target_low > model.target_high:
        errors.append(
            f"目标合格区间下限 {model.target_low} 大于上限 {model.target_high}")
    if abs(model.target_low) > solver.LIMIT_RANGE or abs(model.target_high) > solver.LIMIT_RANGE:
        errors.append(f"目标合格区间上下限须在 ±{solver.LIMIT_RANGE} 以内")
    if errors:
        return JSONResponse(status_code=400, content={"detail": errors})

    edges = solver.build_edges(points, constraints)
    cycle = solver.find_negative_cycle(len(points), edges)
    if cycle is not None:
        # 矛盾输入：只显示现有负环，不输出补测窗口
        return {
            "consistent": False,
            "points": points,
            "contradiction": solver.contradiction_payload(points, edges, cycle),
        }
    return solver.reading_window(
        points, constraints,
        model.from_point.strip(), model.to_point.strip(),
        model.target_from.strip(), model.target_to.strip(),
        model.target_low, model.target_high)


@app.post("/api/shim-plan")
async def shim_plan(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        model = ShimPlanIn(**{**_payload(raw),
                              "target_from": raw.get("targetFrom"),
                              "target_to": raw.get("targetTo"),
                              "target_low": raw.get("targetLow"),
                              "target_high": raw.get("targetHigh"),
                              "positions": raw.get("positions")})
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})

    payload = {
        "points": model.points,
        "constraints": [
            {"id": c.id, "from": c.from_point, "to": c.to_point,
             "low": c.low, "high": c.high}
            for c in model.constraints
        ],
    }
    try:
        points, constraints = solver.validate(payload)
        positions = solver.validate_positions([
            {"direction": p.direction,
             "options": [{"thickness": o.thickness, "cost": o.cost} for o in p.options]}
            for p in model.positions
        ])
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})

    # 目标点对存在性、异同与目标合格区间合法性（沿用查询/补测接口的校验口径）
    errors = []
    if model.target_from.strip() not in points:
        errors.append(f"目标起点 {model.target_from} 尚未录入")
    if model.target_to.strip() not in points:
        errors.append(f"目标终点 {model.target_to} 尚未录入")
    if model.target_from.strip() and model.target_from.strip() == model.target_to.strip():
        errors.append("目标点对的两个点必须不同")
    if model.target_low > model.target_high:
        errors.append(
            f"目标合格区间下限 {model.target_low} 大于上限 {model.target_high}")
    if abs(model.target_low) > solver.LIMIT_RANGE or abs(model.target_high) > solver.LIMIT_RANGE:
        errors.append(f"目标合格区间上下限须在 ±{solver.LIMIT_RANGE} 以内")
    if errors:
        return JSONResponse(status_code=400, content={"detail": errors})

    edges = solver.build_edges(points, constraints)
    cycle = solver.find_negative_cycle(len(points), edges)
    if cycle is not None:
        # 原清单矛盾：只显示现有负环，不输出选配方案
        return {
            "consistent": False,
            "points": points,
            "contradiction": solver.contradiction_payload(points, edges, cycle),
        }
    return solver.shim_plan(
        points, constraints,
        model.target_from.strip(), model.target_to.strip(),
        model.target_low, model.target_high, positions)


@app.post("/api/simplify")
async def simplify(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})

    edges = solver.build_edges(points, constraints)
    cycle = solver.find_negative_cycle(len(points), edges)
    if cycle is not None:
        # 矛盾输入：只显示现有负环，不给出精简清单
        return {
            "consistent": False,
            "points": points,
            "contradiction": solver.contradiction_payload(points, edges, cycle),
        }
    return solver.simplify(points, constraints)


@app.post("/api/tolerance")
async def tolerance(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    try:
        steps = solver.validate_steps(constraints, raw.get("steps"))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    return solver.tolerance(points, constraints, steps)


@app.post("/api/coordinate-fit")
async def coordinate_fit(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    try:
        nominals = solver.validate_nominals(points, raw.get("nominals"))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})

    edges = solver.build_edges(points, constraints)
    cycle = solver.find_negative_cycle(len(points), edges)
    if cycle is not None:
        # 矛盾输入：只显示现有负环，不给出拟合方案
        return {
            "consistent": False,
            "points": points,
            "contradiction": solver.contradiction_payload(points, edges, cycle),
        }
    return solver.coordinate_fit(points, constraints, nominals)


@app.post("/api/chain-impact")
async def chain_impact(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})

    # 基线 / 编辑稿两版分别沿用与 /api/analyze 相同的录入校验
    prepared = {}
    for key, label in (("baseline", "基线"), ("draft", "编辑稿")):
        sub = raw.get(key)
        if not isinstance(sub, dict):
            return JSONResponse(
                status_code=400,
                content={"detail": [f"{label}：必须为包含 points 与 constraints 的对象"]})
        try:
            prepared[key] = _prepare(sub)
        except ValidationError as exc:
            return JSONResponse(
                status_code=400,
                content={"detail": [f"{label}：{m}" for m in _validation_messages(exc)]})
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"detail": [f"{label}：{m}" for m in exc.args[0]]})
    base_points, base_constraints = prepared["baseline"]
    draft_points, draft_constraints = prepared["draft"]

    # 基准点名称和顺序须完全相同（测量可增删改）
    if base_points != draft_points:
        return JSONResponse(status_code=400, content={"detail": [
            "基线与编辑稿的基准点名称和顺序必须完全相同（测量可增删改，基准点不可变）",
            f"基线基准点：{'、'.join(base_points)}",
            f"编辑稿基准点：{'、'.join(draft_points)}",
        ]})
    return solver.chain_impact(base_points, base_constraints, draft_constraints)


@app.post("/api/min-removal")
async def min_removal(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    try:
        removable = solver.validate_removable(constraints, raw.get("removableIds"))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    return solver.min_removal(points, constraints, removable)


@app.post("/api/inspection-order")
async def inspection_order(request: Request):
    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": ["请求体不是合法的 JSON"]})
    if not isinstance(raw, dict):
        return JSONResponse(status_code=400, content={"detail": ["请求体必须是 JSON 对象"]})
    try:
        points, constraints = _prepare(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400,
                            content={"detail": _validation_messages(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    try:
        items = solver.validate_inspection_items(constraints, raw.get("items"))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": list(exc.args[0])})
    return solver.inspection_order(points, constraints, items)


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC_DIR / "index.html")
