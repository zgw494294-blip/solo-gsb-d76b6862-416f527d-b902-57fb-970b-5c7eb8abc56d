"""尺寸链约束求解：差分约束系统 / 负权闭环 / 最紧间隙界。

建模（坐标 x_v 表示基准点 v 的坐标，单位微米）：
    约束 m: low_m <= x[to] - x[from] <= high_m
    两条有向边（差分约束标准形式 x[v] - x[u] <= w 即边 u -> v 权 w）：
      from -> to, 权 high_m  （正向：采用上限）
      to   -> from, 权 -low_m（逆向：采用下限）

- 可行性：无负环（Bellman-Ford，N-1 轮松弛 + 前驱链回溯找负权闭环）。
- 最紧界（一致时）：对任意 p, q，x[q]-x[p] 恰为 dist[p][q]（Floyd 全源最短路）。
  故 gap = x[q]-x[p] 的最紧区间为 [ -dist[q][p], dist[p][q] ]；
  任一侧不可达则该点对在约束图中不连通，间隙无界，不判合格。
- 容差预算：每条区间按 [low-k*s, high+k*s] 随预算 k 放宽（s 为该测量步长，
  0 即锁定），边权随 k 单调不减，一致性关于 k 单调，二分求首次一致的最小 k。
- 名义坐标拟合：锚点代表绝对零位（首点坐标固定为 0），|x_i − 名义_i| ≤ D
  化作一对锚点界边；D 的可行性即负环判定、关于 D 单调，二分求最小 D；
  再按录入顺序逐点固定为当前最紧下界 −dist(i, 锚点)，得字典序最小解。
- 垫片组合选配：垫片不改变测量，只把目标点对的有界最紧区间 [L, U] 整体平移
  为 [L+S, U+S]（S 为各安装位“方向 × 所选厚度”之和）。落入合格区间 [T₀, T₁]
  等价于 S ∈ [T₀−L, T₁−U]；按“有符号厚度和 → (最低成本, 最小字典序秩)”
  做分层动态规划（同和状态合并、按后缀可达区间剪枝；每层按预计可达状态数
  在稀疏字典与稠密数组间重选表示，稀疏可达和绝不按整个整数跨度开数组），
  不逐一枚举 ∏选项数 个组合。
- 尺寸链改动影响：同一组基准点（名称与顺序相同）下两版测量清单各自判负环，
  任一版矛盾即只返回各矛盾版本的负环；均一致时对两版分别求 Floyd 全源最短路，
  按基准点录入顺序逐有序异点对比较最紧区间与无界状态，仅报告发生变化的点对，
  并按区间包含关系分为收紧 / 放宽 / 混合，单独区分变为有界与变为无界。
- 矛盾测量最小撤回：只允许删除可撤回测量（至多 16 条），求使剩余清单一致的
  最少删除集合——即原图全部负权闭环的最小碰集；搜索由负环引导分支（只沿当前
  负环上的可撤回编号分支）并以“可撤回编号两两不交的负环打包”作下界剪枝，
  不枚举全部删除子集；并列时按原录入顺序取删除序号列表字典序最小者；
  锁定测量自身矛盾时不可修复，返回锁定部分的负环。
- 测量复核排程：从清单选取 1～16 条测量，各带复核耗时 d（1～1000 整数）与
  独立不合格概率 p（0～999‰ 整数），前置依赖只能引用所选测量且不许成环。
  按序复核、遇首条不合格即停止，顺序 π 的预期总耗时为
  Σ_k d_{π_k}·Π_{j<k}(1−p_{π_j}/1000)；在满足全部前置约束（被依赖项先复核）
  的完整顺序中取其最小者，并列时按原录入位置序号向量取字典序最小。
  子集动态规划（2^n 状态，不枚举全排列）：用未约分的整数分子 G(S) 做
  精确比较（分母统一为 1000^|S|），概率与期望值一律以精确分数返回。
差分约束相关运算均为整数；复核排程的概率/期望用 fractions.Fraction
精确表示（分母只含因子 2、5，小数有尽），均无浮点误差。
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

MAX_POINTS = 30
MIN_POINTS = 2
MAX_CONSTRAINTS = 80
MIN_CONSTRAINTS = 1
LIMIT_RANGE = 10**9  # 上下限绝对值上限
WINDOW_RANGE = 10**9  # 补测读数 r 的取值范围 ±WINDOW_RANGE


@dataclass(frozen=True)
class Edge:
    u: int
    v: int
    w: int
    cid: str
    # forward=True: 起->止，采用上限；False: 止->起，采用下限
    forward: bool


def validate(payload: dict) -> tuple[list[str], list[dict]]:
    """校验入参，返回 (点名列表, 约束字典列表)；失败抛 ValueError(消息列表)。"""
    errors: list[str] = []

    points = payload.get("points")
    if not isinstance(points, list):
        raise ValueError(["points 必须为字符串数组"])
    norm_points: list[str] = []
    for i, p in enumerate(points):
        name = p.strip() if isinstance(p, str) else ""
        if not name:
            errors.append(f"第 {i + 1} 个基准点：名称为空")
        elif name in norm_points:
            errors.append(f"基准点名称重复：{name}")
        norm_points.append(name)
    if not errors:
        if not (MIN_POINTS <= len(norm_points) <= MAX_POINTS):
            errors.append(f"基准点数量须为 {MIN_POINTS}～{MAX_POINTS} 个（当前 {len(norm_points)}）")

    constraints = payload.get("constraints")
    if not isinstance(constraints, list):
        raise ValueError(["constraints 必须为对象数组"])
    norm_constraints: list[dict] = []
    seen_ids: set[str] = set()
    for i, c in enumerate(constraints):
        prefix = f"约束 {i + 1}"
        if not isinstance(c, dict):
            errors.append(f"{prefix}：格式不是对象")
            continue
        cid = c.get("id")
        cid = cid.strip() if isinstance(cid, str) else ""
        if not cid:
            errors.append(f"{prefix}：编号为空")
        elif cid in seen_ids:
            errors.append(f"{prefix}：编号重复（{cid}）")
        seen_ids.add(cid)

        p_from = c.get("from") if isinstance(c.get("from"), str) else None
        p_to = c.get("to") if isinstance(c.get("to"), str) else None
        p_from = p_from.strip() if p_from else ""
        p_to = p_to.strip() if p_to else ""
        if p_from == "":
            errors.append(f"{prefix}（{cid or '无编号'}）：起点为空")
        elif norm_points and p_from not in norm_points:
            errors.append(f"{prefix}（{cid}）：起点 {p_from} 尚未录入")
        if p_to == "":
            errors.append(f"{prefix}（{cid or '无编号'}）：终点为空")
        elif norm_points and p_to not in norm_points:
            errors.append(f"{prefix}（{cid}）：终点 {p_to} 尚未录入")
        if p_from and p_to and p_from == p_to:
            errors.append(f"{prefix}（{cid}）：起点与终点必须不同")

        low = c.get("low")
        high = c.get("high")
        if not isinstance(low, int) or isinstance(low, bool):
            errors.append(f"{prefix}（{cid}）：下限必须为整数")
            low = None
        if not isinstance(high, int) or isinstance(high, bool):
            errors.append(f"{prefix}（{cid}）：上限必须为整数")
            high = None
        if low is not None and abs(low) > LIMIT_RANGE:
            errors.append(f"{prefix}（{cid}）：下限超出 ±{LIMIT_RANGE}")
        if high is not None and abs(high) > LIMIT_RANGE:
            errors.append(f"{prefix}（{cid}）：上限超出 ±{LIMIT_RANGE}")
        if low is not None and high is not None and low > high:
            errors.append(f"{prefix}（{cid}）：下限 {low} 大于上限 {high}")

        norm_constraints.append({"id": cid, "from": p_from, "to": p_to,
                                 "low": low, "high": high})

    if not errors and not (MIN_CONSTRAINTS <= len(norm_constraints) <= MAX_CONSTRAINTS):
        errors.append(f"约束数量须为 {MIN_CONSTRAINTS}～{MAX_CONSTRAINTS} 条（当前 {len(norm_constraints)}）")

    if errors:
        raise ValueError(errors)
    return norm_points, norm_constraints


def build_edges(points: list[str], constraints: list[dict]) -> list[Edge]:
    idx = {name: i for i, name in enumerate(points)}
    edges: list[Edge] = []
    for c in constraints:
        u = idx[c["from"]]
        v = idx[c["to"]]
        edges.append(Edge(u, v, c["high"], c["id"], True))
        edges.append(Edge(v, u, -c["low"], c["id"], False))
    return edges


def find_negative_cycle(n: int, edges: list[Edge]) -> list[int] | None:
    """Bellman-Ford：返回构成负权闭环的边在 edges 中的下标（沿环顺序），无则 None。"""
    dist = [0] * n                 # 虚拟超源：所有点初值 0
    parent_v = [-1] * n            # 最后一次松弛进入该点的边的起点
    parent_e = [-1] * n            # 最后一次松弛进入该点的边下标

    x = -1
    for _ in range(n):
        x = -1
        for ei, e in enumerate(edges):
            nd = dist[e.u] + e.w
            if nd < dist[e.v]:
                dist[e.v] = nd
                parent_v[e.v] = e.u
                parent_e[e.v] = ei
                x = e.v
        if x == -1:
            return None
    if x == -1:
        return None

    # 第 n 轮仍可松弛的点 x，沿前驱回退 n 步后必在负环上
    y = x
    for _ in range(n):
        y = parent_v[y]
        if y < 0:
            return None

    cycle_edges: list[int] = []
    cur = y
    while True:
        ei = parent_e[cur]
        if ei < 0:
            return None
        cycle_edges.append(ei)
        cur = parent_v[cur]
        if cur == y:
            break
        if len(cycle_edges) > n:
            return None

    cycle_edges.reverse()  # 改为沿环方向（从 y 出发）的顺序
    if sum(edges[i].w for i in cycle_edges) < 0:
        return cycle_edges
    return None


def all_pairs_shortest(n: int, edges: list[Edge]) -> list[list[int | None]]:
    """Floyd 全源最短路（仅在无负环时调用）。不可达为 None。"""
    inf = None
    d: list[list[int | None]] = [[inf] * n for _ in range(n)]
    for i in range(n):
        d[i][i] = 0
    for e in edges:
        old = d[e.u][e.v]
        if old is None or e.w < old:
            d[e.u][e.v] = e.w
    for k in range(n):
        dk = d[k]
        for i in range(n):
            dik = d[i][k]
            if dik is None:
                continue
            di = d[i]
            for j in range(n):
                dkj = dk[j]
                if dkj is None:
                    continue
                cand = dik + dkj
                if di[j] is None or cand < di[j]:
                    di[j] = cand
    return d


def describe_cycle(edges: list[Edge], cycle: list[int]) -> dict:
    segments = []
    total = 0
    for ei in cycle:
        e = edges[ei]
        if e.forward:
            seg = {
                "measurementId": e.cid,
                "direction": "forward",
                "fromIndex": e.u,
                "toIndex": e.v,
                "usedBound": "upper",
                "weight": e.w,
            }
        else:
            seg = {
                "measurementId": e.cid,
                "direction": "reverse",
                "fromIndex": e.u,
                "toIndex": e.v,
                "usedBound": "lower",
                "weight": e.w,
            }
        segments.append(seg)
        total += e.w
    return {"segments": segments, "weightSum": total}


def contradiction_payload(points: list[str], edges: list[Edge], cycle: list[int]) -> dict:
    """负权闭环（边下标列表）-> 对外的矛盾证据结构。"""
    info = describe_cycle(edges, cycle)
    return {
        "segments": [
            {
                "measurementId": s["measurementId"],
                "direction": s["direction"],
                "from": points[s["fromIndex"]],
                "to": points[s["toIndex"]],
                "usedBound": s["usedBound"],
                "weight": s["weight"],
            }
            for s in info["segments"]
        ],
        "weightSum": info["weightSum"],
    }


def analyze(points: list[str], constraints: list[dict]) -> dict:
    edges = build_edges(points, constraints)
    n = len(points)
    cycle = find_negative_cycle(n, edges)
    if cycle is not None:
        return {
            "consistent": False,
            "points": points,
            "contradiction": contradiction_payload(points, edges, cycle),
        }

    dist = all_pairs_shortest(n, edges)
    return {
        "consistent": True,
        "points": points,
        "dist": dist,  # None 表示不可达
    }


def classify(target_low: int, target_high: int, low: int, high: int) -> str:
    """目标区间 [target_low, target_high] 与约束最紧区间 [low, high] 的关系。"""
    if high < target_low or target_high < low:
        return "fail"        # 不相交 -> 超差
    if target_low <= low and high <= target_high:
        return "pass"        # 全落入 -> 合格
    return "review"          # 仅相交 -> 待复核


def query(analysis: dict, p_from: str, p_to: str,
          target_low: int, target_high: int) -> dict:
    points = analysis["points"]
    i = points.index(p_from)
    j = points.index(p_to)
    d_ij = analysis["dist"][i][j]
    d_ji = analysis["dist"][j][i]

    result = {
        "from": p_from,
        "to": p_to,
        "targetLow": target_low,
        "targetHigh": target_high,
    }
    if d_ij is None or d_ji is None:
        result.update({"bounded": False})
        return result

    low = -d_ji
    high = d_ij
    result.update({
        "bounded": True,
        "low": low,
        "high": high,
        "verdict": classify(target_low, target_high, low, high),
    })
    return result


# ============================ 测量清单精简 ============================

def _kept_dist(points: list[str], constraints: list[dict],
               kept: list[bool]) -> list[list[int | None]]:
    """对当前保留约束重算全源最短路（调用方须保证系统一致、无负环）。

    删去一条测量即删去它贡献的两条边；这里只对保留的约束建边，
    复用 all_pairs_shortest 的 Floyd 实现。
    """
    edges = build_edges(points, [c for c, k in zip(constraints, kept) if k])
    return all_pairs_shortest(len(points), edges)


def _first_changed_pair(points: list[str],
                        base: list[list[int | None]],
                        trial: list[list[int | None]]) -> dict:
    """按基准点录入顺序找首个界值/无界状态不同的有序点对，返回其删前删后界。

    删边只会放松最短路：上界 dist[p][q] 只能变大或由有界变无界(None)。
    有序点对 p→q 的最紧区间为 [下界, 上界] = [-dist[q][p], dist[p][q]]，
    逐有序对比较矩阵元素即等价于逐对比较下界、上界与无界状态。
    """
    n = len(points)
    for p in range(n):
        for q in range(n):
            if p == q:
                continue
            if base[p][q] != trial[p][q]:
                upper_before = base[p][q]
                upper_after = trial[p][q]
                return {
                    "from": points[p],
                    "to": points[q],
                    "lowerBefore": None if base[q][p] is None else -base[q][p],
                    "lowerAfter": None if trial[q][p] is None else -trial[q][p],
                    "upperBefore": upper_before,
                    "upperAfter": upper_after,
                    "changedSide": "unbounded" if (upper_before is None) != (upper_after is None)
                    or (base[q][p] is None) != (trial[q][p] is None) else "loosened",
                }
    raise RuntimeError("试删后未找到任何变化点对")


def simplify(points: list[str], constraints: list[dict]) -> dict:
    """测量清单精简（系统一致时）。

    按录入顺序逐条试删：每次从当前保留集合重算全部有序点对的最紧上下界，
    仅当每对的界值与无界状态均与原清单相同时才真正删去；后续判断基于已删结果。
    返回保留/可删编号；对每条保留约束给出“再删它”时按基准点录入顺序找到的
    首个变化点对及其删前、删后界。最终保留集合不可再删。
    """
    n = len(points)
    m = len(constraints)

    # 原清单（全部约束）基准矩阵
    base = _kept_dist(points, constraints, [True] * m)

    kept = [True] * m
    removable: list[str] = []
    for t in range(m):
        trial_kept = kept.copy()
        trial_kept[t] = False
        trial = _kept_dist(points, constraints, trial_kept)
        if trial == base:           # 全部有序点对的界值与无界状态均不变
            kept[t] = False
            removable.append(constraints[t]["id"])

    # 对每条最终保留约束计算“再删它”的见证（基于已删结果）
    current = _kept_dist(points, constraints, kept)
    retained: list[dict] = []
    for t in range(m):
        if not kept[t]:
            continue
        trial_kept = kept.copy()
        trial_kept[t] = False
        trial = _kept_dist(points, constraints, trial_kept)
        witness = _first_changed_pair(points, current, trial)
        retained.append({"id": constraints[t]["id"], "witness": witness})

    return {
        "consistent": True,
        "points": points,
        "simplify": {
            "retainedIds": [constraints[t]["id"] for t in range(m) if kept[t]],
            "removableIds": removable,
            "retained": retained,
        },
    }


# ============================ 测量容差预算 ============================

DEFAULT_STEP = 1
MAX_STEP = 1000


def validate_steps(constraints: list[dict], raw_steps) -> dict[str, int]:
    """校验“编号 -> 步长”映射，返回每条约束的有效步长（未列出的编号取 DEFAULT_STEP）。

    步长须为 0～MAX_STEP 的整数；0 表示锁定（区间不随预算 k 放宽）。
    映射中出现未录入的测量编号（多余编号）即报错。
    """
    if raw_steps is None:
        raw_steps = {}
    if not isinstance(raw_steps, dict):
        raise ValueError(["steps 必须为对象：键为测量编号，值为 0～1000 的整数步长"])

    ids = [c["id"] for c in constraints]
    id_set = set(ids)
    errors: list[str] = []
    given: dict[str, int] = {}
    extras: list[str] = []
    for key, val in raw_steps.items():
        cid = key.strip() if isinstance(key, str) else str(key)
        if cid not in id_set:
            extras.append(cid or "（空编号）")
            continue
        if not isinstance(val, int) or isinstance(val, bool):
            errors.append(f"测量 {cid}：步长必须为整数")
        elif not 0 <= val <= MAX_STEP:
            errors.append(f"测量 {cid}：步长须为 0～{MAX_STEP}（当前 {val}）")
        else:
            given[cid] = val
    if extras:
        errors.append("步长映射包含未录入的测量编号：" + "、".join(extras))
    if errors:
        raise ValueError(errors)
    return {cid: given.get(cid, DEFAULT_STEP) for cid in ids}


def _budget_edges(points: list[str], constraints: list[dict],
                  steps: dict[str, int], k: int) -> list[Edge]:
    """预算 k 下的建边：每条 [low, high] 放宽为 [low − k·步长, high + k·步长]。"""
    idx = {name: i for i, name in enumerate(points)}
    edges: list[Edge] = []
    for c in constraints:
        s = steps[c["id"]]
        u = idx[c["from"]]
        v = idx[c["to"]]
        edges.append(Edge(u, v, c["high"] + k * s, c["id"], True))
        edges.append(Edge(v, u, -(c["low"] - k * s), c["id"], False))
    return edges


def tolerance(points: list[str], constraints: list[dict],
              steps: dict[str, int]) -> dict:
    """测量容差预算：求使整张清单首次一致的最小非负整数 k。

    - k = 0 即原清单：一致则直接返回 0；
    - 锁定测量（步长 0）的区间不随 k 变化，若它们自身已含负权闭环，
      则该矛盾对任意 k 成立，返回不可修复及该负环；
    - 否则边权随 k 单调不减，一致性关于 k 单调，二分最小可行 k；
      返回 k−1 下的负环（再小一步仍矛盾的证据）与 k 下每条测量的
      调整后区间（计算值允许超出原始录入范围 ±LIMIT_RANGE）。
    """
    n = len(points)
    base = {"points": points, "steps": steps}

    edges0 = _budget_edges(points, constraints, steps, 0)
    if find_negative_cycle(n, edges0) is None:
        return {**base, "repairable": True, "k": 0}

    # 锁定测量（步长 0）自身矛盾 -> 不可修复
    locked = [c for c in constraints if steps[c["id"]] == 0]
    if locked:
        locked_edges = build_edges(points, locked)
        cycle = find_negative_cycle(n, locked_edges)
        if cycle is not None:
            return {**base, "repairable": False,
                    "contradiction": contradiction_payload(points, locked_edges, cycle)}

    # 上界：任一简单环至多 n 条边、每边权 >= w_min；含非锁定边的环步长和 >= 1，
    # 故 k >= -n * w_min 时所有环权重非负（k = 0 已矛盾，w_min 必为负）。
    w_min = min(e.w for e in edges0)
    lo, hi = 1, max(1, -n * w_min)
    while lo < hi:
        mid = (lo + hi) // 2
        if find_negative_cycle(n, _budget_edges(points, constraints, steps, mid)) is None:
            hi = mid
        else:
            lo = mid + 1
    k = lo

    # k−1 下的负权闭环（二分不变式保证存在）
    edges_prev = _budget_edges(points, constraints, steps, k - 1)
    cycle_prev = find_negative_cycle(n, edges_prev)
    if cycle_prev is None:
        raise RuntimeError("二分不变式被破坏：k−1 下未找到负权闭环")

    adjusted = [
        {
            "id": c["id"],
            "step": steps[c["id"]],
            "low": c["low"],
            "high": c["high"],
            "adjustedLow": c["low"] - k * steps[c["id"]],
            "adjustedHigh": c["high"] + k * steps[c["id"]],
        }
        for c in constraints
    ]
    return {
        **base,
        "repairable": True,
        "k": k,
        "previousContradiction": contradiction_payload(points, edges_prev, cycle_prev),
        "adjusted": adjusted,
    }


# ============================ 名义坐标拟合 ============================

def validate_nominals(points: list[str], raw_nominals) -> dict[str, int]:
    """校验“点名 -> 名义坐标”映射，返回按基准点录入顺序排列的名义坐标。

    名义坐标须恰好覆盖全部点名（缺点名、含未录入点名均报错）；
    值须为 ±LIMIT_RANGE 内的整数。
    """
    if raw_nominals is None:
        raw_nominals = {}
    if not isinstance(raw_nominals, dict):
        raise ValueError(["nominals 必须为对象：键为基准点名，值为整数名义坐标（微米）"])

    point_set = set(points)
    errors: list[str] = []
    given: dict[str, int] = {}
    seen: set[str] = set()
    extras: list[str] = []
    for key, val in raw_nominals.items():
        name = key.strip() if isinstance(key, str) else str(key)
        if name not in point_set:
            extras.append(name or "（空点名）")
            continue
        seen.add(name)
        if not isinstance(val, int) or isinstance(val, bool):
            errors.append(f"基准点 {name}：名义坐标必须为整数")
        elif abs(val) > LIMIT_RANGE:
            errors.append(f"基准点 {name}：名义坐标超出 ±{LIMIT_RANGE}")
        else:
            given[name] = val
    if extras:
        errors.append("名义坐标映射包含未录入的基准点：" + "、".join(extras))
    missing = [p for p in points if p not in seen]
    if missing:
        errors.append("名义坐标映射缺少基准点：" + "、".join(missing))
    if errors:
        raise ValueError(errors)
    return {p: given[p] for p in points}


def _feasible_potential(n: int, edges: list[Edge]) -> list[int]:
    """Bellman-Ford（虚拟超源，初值全 0）；调用方须保证无负环。返回一组可行势。"""
    dist = [0] * n
    for _ in range(n - 1):
        updated = False
        for e in edges:
            nd = dist[e.u] + e.w
            if nd < dist[e.v]:
                dist[e.v] = nd
                updated = True
        if not updated:
            break
    return dist


def _distances_to(n: int, edges: list[Edge], target: int) -> list[int | None]:
    """无负环图中各点到 target 的最短路（反向图上自 target 的 Bellman-Ford）。"""
    dist: list[int | None] = [None] * n
    dist[target] = 0
    for _ in range(n - 1):
        updated = False
        for e in edges:
            dv = dist[e.v]
            if dv is None:
                continue
            cand = dv + e.w
            du = dist[e.u]
            if du is None or cand < du:
                dist[e.u] = cand
                updated = True
        if not updated:
            break
    return dist


def coordinate_fit(points: list[str], constraints: list[dict],
                   nominals: dict[str, int]) -> dict:
    """名义坐标拟合（系统一致时调用；矛盾检测由调用方先行完成）。

    在满足全部测量的整数坐标方案中（首个基准点实际坐标固定为 0）：
      1. 最小化 D = max |x_i − 名义_i|：|x_i − 名义_i| ≤ D 即一对锚点界边，
         给定 D 的可行性 = 无负环，且关于 D 单调，二分求最小可行 D；
      2. 在 D 最小的方案中按基准点录入顺序取坐标向量字典序最小者：
         差分约束对单变量的投影是区间 [−dist(i,锚点), dist(锚点,i)]，
         固定其中任一整数值都保持可行，故逐点取当前最紧下界即可（贪心）。
    返回 D、各点实际坐标与有符号偏差（实际 − 名义）；计算值允许超出 ±LIMIT_RANGE。
    """
    n = len(points)
    a = n  # 锚点下标：代表绝对零位，x[首点] 经两条 0 权边与锚点相等
    base_edges = build_edges(points, constraints)
    anchor_edges = [Edge(a, 0, 0, "", True), Edge(0, a, 0, "", False)]

    def edges_with_d(limit: int) -> list[Edge]:
        edges = list(base_edges) + list(anchor_edges)
        for i, p in enumerate(points):
            nv = nominals[p]
            edges.append(Edge(a, i, nv + limit, "", True))    # x_i − x_a ≤ 名义_i + D
            edges.append(Edge(i, a, limit - nv, "", False))   # x_a − x_i ≤ D − 名义_i
        return edges

    # D 的上界：任取一组可行势（平移使首点为 0）即为一个可行方案
    pot = _feasible_potential(n + 1, base_edges + anchor_edges)
    hi = max(abs(pot[i] - pot[0] - nominals[p]) for i, p in enumerate(points))
    lo = 0
    while lo < hi:
        mid = (lo + hi) // 2
        if find_negative_cycle(n + 1, edges_with_d(mid)) is None:
            hi = mid
        else:
            lo = mid + 1
    limit = lo

    # 字典序最小化：按录入顺序逐点取当前最紧下界并固定（界边保证各点可达锚点）
    edges = edges_with_d(limit)
    coords = [0] * n
    for i in range(n):
        coords[i] = -_distances_to(n + 1, edges, a)[i]
        edges.append(Edge(a, i, coords[i], "", True))
        edges.append(Edge(i, a, -coords[i], "", False))

    max_dev = max(abs(coords[i] - nominals[p]) for i, p in enumerate(points))
    return {
        "consistent": True,
        "points": points,
        "nominals": {p: nominals[p] for p in points},
        "fit": {
            "maxDeviation": max_dev,
            "coordinates": [
                {
                    "point": p,
                    "nominal": nominals[p],
                    "actual": coords[i],
                    "deviation": coords[i] - nominals[p],
                }
                for i, p in enumerate(points)
            ],
        },
    }


# ============================ 补测读数窗口 ============================

def reading_window(points: list[str], constraints: list[dict],
                   from_point: str, to_point: str,
                   target_from: str, target_to: str,
                   target_low: int, target_high: int) -> dict:
    """补测读数窗口（仅在原清单一致时调用；矛盾检测由调用方先行完成）。

    在基准点 from_point → to_point 之间拟补一条精确测量 [r, r]（整数 μm）。
    加入后：
      - 整张清单须仍一致（无负环）；
      - 目标点对 target_from → target_to 的间隙最紧界须有界，且完全落入
        合格区间 [target_low, target_high]。
    在 r ∈ [−WINDOW_RANGE, WINDOW_RANGE] 的整数范围内，求全部满足条件的 r
    所构成的、不可再扩展（极大）且互不相邻的整数闭区间，按起点升序返回。

    精确补测 [r,r] 只新增两条边：a→b 权 r、b→a 权 −r（a、b 为补测起终点）。
    设原清单（无负环）Floyd 全源最短路为 dist，则任意两点新最紧上界：
        dist'[u][v] = min(dist[u][v],
                          dist[u][a] + r + dist[b][v]  （经 a→b 边）,
                          dist[u][b] − r + dist[a][v]) （经 b→a 边）
    （路径至多使用一次新边：任一路径多次使用两条新边即含环；无负环时去环后
      不更长。各项不可达视为 +∞。）于是：

    1) 一致性：新环必含新边。a→b 边参与的负环对应 dist[b][a] + r < 0，
       即 r < −dist[b][a]（下界 L，dist[b][a] 不可达则无此约束）；
       b→a 边参与的负环对应 dist[a][b] − r < 0，即 r > dist[a][b]
       （上界 U，dist[a][b] 不可达则无此约束）。可行 r ∈ [L, U]。
    2) 有界且合格：对目标上界 dist'[p][q] ≤ target_high、目标下界
       −dist'[q][p] ≥ target_low ⇔ dist'[q][p] ≤ −target_low 各禁用一个 r
       区间；另须两种经新边的路径都存在，否则对应新最紧界仍可能无界
       （原界已不可达时，缺一种经新边路径即永久无界 → 禁用全部 r）。
    所有界均为 r 的分段线性函数，禁用集至多是两个整数闭区间/半直线，与
    [−WINDOW_RANGE, WINDOW_RANGE] 交并后取补集即可，全程 O(n³)，不枚举 r。
    """
    n = len(points)
    idx = {name: i for i, name in enumerate(points)}
    a = idx[from_point]
    b = idx[to_point]
    p = idx[target_from]
    q = idx[target_to]

    dist = all_pairs_shortest(n, build_edges(points, constraints))

    # 一致性给出的 r 范围 [lower, upper]（已含 ±WINDOW_RANGE 裁剪）
    lower = -WINDOW_RANGE
    upper = WINDOW_RANGE
    if dist[b][a] is not None:
        lower = max(lower, -dist[b][a])
    if dist[a][b] is not None:
        upper = min(upper, dist[a][b])

    def forbidden(u: int, v: int, bound: int) -> tuple[int | None, int | None]:
        """使 dist'[u][v] > bound 的整数 r 集合，表示为一个闭区间 [f_lo, f_hi]；
        端为 None 表示该侧无界；空集返回 (1, 0)。

        dist'[u][v] = min(原界, α+r, β−r)，其中
            α = dist[u][a] + dist[b][v]（经 a→b），β = dist[u][b] + dist[a][v]（经 b→a）。
        min > bound 须各项同时 > bound；原界已不可达或 > bound 时只需
            α + r > bound ⇔ r ≥ bound−α+1，β − r > bound ⇔ r ≤ β−bound−1，
        两个半直线取交集即单个闭区间。
        """
        t0 = dist[u][v]
        if t0 is not None and t0 <= bound:
            return 1, 0  # 原界已不超过 bound：无禁用值
        has_plus = dist[u][a] is not None and dist[b][v] is not None
        has_minus = dist[u][b] is not None and dist[a][v] is not None
        if not has_plus and not has_minus:
            return None, None  # 目标界无界且任何 r 下都无法建立连接：全部禁用
        f_lo = None
        f_hi = None
        if has_plus:
            f_lo = bound - (dist[u][a] + dist[b][v]) + 1
        if has_minus:
            f_hi = (dist[u][b] + dist[a][v]) - bound - 1
        if f_lo is not None and f_hi is not None and f_lo > f_hi:
            return 1, 0
        return f_lo, f_hi

    # 目标上界超 target_high、目标下界低于 target_low 各自的禁用区间
    forbidden_intervals = [
        forbidden(p, q, target_high),
        forbidden(q, p, -target_low),
    ]

    # 裁剪到 [lower, upper]（None 端为无界），剔除空集，合并相交/相邻区间
    blocked: list[tuple[int, int]] = []
    for f_lo, f_hi in forbidden_intervals:
        if f_lo is not None and f_hi is not None and f_lo > f_hi:
            continue
        x = lower if f_lo is None else max(f_lo, lower)
        y = upper if f_hi is None else min(f_hi, upper)
        if x <= y:
            blocked.append((x, y))
    blocked.sort()
    merged: list[tuple[int, int]] = []
    for x, y in blocked:
        if merged and x <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], y))
        else:
            merged.append((x, y))

    # 合并后的禁用区间在 [lower, upper] 中的补集，即全部极大、互不相邻窗口
    windows: list[dict] = []
    cur = lower
    for x, y in merged:
        if cur <= x - 1:
            windows.append({"low": cur, "high": x - 1})
        cur = max(cur, y + 1)
    if cur <= upper:
        windows.append({"low": cur, "high": upper})

    return {
        "consistent": True,
        "points": points,
        "from": from_point,
        "to": to_point,
        "targetFrom": target_from,
        "targetTo": target_to,
        "targetLow": target_low,
        "targetHigh": target_high,
        "rangeLow": -WINDOW_RANGE,
        "rangeHigh": WINDOW_RANGE,
        "windows": windows,
    }


# ============================ 垫片组合选配 ============================

MIN_POSITIONS = 1
MAX_POSITIONS = 10
MIN_OPTIONS = 1
MAX_OPTIONS = 6
MAX_THICKNESS = 10**6
MAX_SHIM_COST = 1000


def validate_positions(raw_positions) -> list[dict]:
    """校验垫片安装位定义，返回规范化列表；失败抛 ValueError(消息列表)。

    每位：direction ∈ {+1, −1}；options 1～6 个，每个为
    {thickness: 0～MAX_THICKNESS 整数, cost: 0～MAX_SHIM_COST 整数}。
    """
    if not isinstance(raw_positions, list):
        raise ValueError(["安装位 positions 必须为对象数组"])
    if not (MIN_POSITIONS <= len(raw_positions) <= MAX_POSITIONS):
        raise ValueError([f"安装位数量须为 {MIN_POSITIONS}～{MAX_POSITIONS} 个"
                          f"（当前 {len(raw_positions)}）"])

    errors: list[str] = []
    positions: list[dict] = []
    for i, pos in enumerate(raw_positions):
        prefix = f"安装位 {i + 1}"
        if not isinstance(pos, dict):
            errors.append(f"{prefix}：格式不是对象")
            continue
        direction = pos.get("direction")
        if not isinstance(direction, int) or isinstance(direction, bool) or direction not in (1, -1):
            errors.append(f"{prefix}：方向必须为 +1 或 -1（当前 {direction!r}）")

        raw_options = pos.get("options")
        if not isinstance(raw_options, list):
            errors.append(f"{prefix}：选项 options 必须为数组")
            options = []
        else:
            if not (MIN_OPTIONS <= len(raw_options) <= MAX_OPTIONS):
                errors.append(f"{prefix}：选项数量须为 {MIN_OPTIONS}～{MAX_OPTIONS} 个"
                              f"（当前 {len(raw_options)}）")
            options = []
            for j, opt in enumerate(raw_options):
                oprefix = f"{prefix} 第 {j + 1} 个选项"
                if not isinstance(opt, dict):
                    errors.append(f"{oprefix}：格式不是对象")
                    continue
                thickness = opt.get("thickness")
                cost = opt.get("cost")
                if not isinstance(thickness, int) or isinstance(thickness, bool):
                    errors.append(f"{oprefix}：厚度必须为整数")
                elif not 0 <= thickness <= MAX_THICKNESS:
                    errors.append(f"{oprefix}：厚度须为 0～{MAX_THICKNESS} 微米"
                                  f"（当前 {thickness}）")
                if not isinstance(cost, int) or isinstance(cost, bool):
                    errors.append(f"{oprefix}：成本必须为整数")
                elif not 0 <= cost <= MAX_SHIM_COST:
                    errors.append(f"{oprefix}：成本须为 0～{MAX_SHIM_COST}（当前 {cost}）")
                if isinstance(thickness, int) and not isinstance(thickness, bool) \
                        and isinstance(cost, int) and not isinstance(cost, bool):
                    options.append({"thickness": thickness, "cost": cost})
        positions.append({"direction": direction, "options": options})

    if errors:
        raise ValueError(errors)
    return positions


def _suffix_extrema(positions: list[dict], t: int) -> tuple[int, int]:
    """安装位 t..k-1 可叠加的有符号厚度和的最小/最大值；t == k 时为 (0, 0)。"""
    lo = hi = 0
    for pos in positions[t:]:
        d = pos["direction"]
        vals = [d * o["thickness"] for o in pos["options"]]
        lo += min(vals)
        hi += max(vals)
    return lo, hi


def shim_plan(points: list[str], constraints: list[dict],
              target_from: str, target_to: str,
              target_low: int, target_high: int,
              positions: list[dict]) -> dict:
    """垫片组合选配（仅在原清单一致、目标点对有界时调用）。

    垫片不改动任何测量，只把目标点对 target_from → target_to 的原最紧间隙区间
    [L, U]（有界）整体平移为 [L+S, U+S]，其中每位恰选一个选项、
    S = Σ 方向_i × 所选厚度_i。要求平移后整个区间落入合格区间
    [target_low, target_high]，即 S ∈ [target_low−L, target_high−U]。

    优化目标：先最小化所选选项总成本；并列时按安装位顺序取从 1 开始的
    选项序号向量字典序最小者。算法为按“有符号厚度和”分层的动态规划：
    同一和状态只保留 (最低成本, 最小字典序秩)（打包为一个整数编码），
    并按后缀可达区间剪掉绝无可能落入所需区间的状态；秩是选项序号向量的
    6 进制编码，末层最优状态的秩逐位解码即得选项序号向量。每层按
    “预计可达状态数 / 保留跨度”在稀疏字典与稠密区间数组（偏移 + INF
    哨兵）之间重新选择表示：稀疏可达和只按状态数分配内存，绝不按整个
    整数跨度开数组。状态数是可达有符号和的个数，不是 ∏选项数，
    故不逐一枚举全部组合。
    """
    n = len(points)
    idx = {name: i for i, name in enumerate(points)}
    p = idx[target_from]
    q = idx[target_to]
    dist = all_pairs_shortest(n, build_edges(points, constraints))

    base: dict = {
        "consistent": True,
        "points": points,
        "targetFrom": target_from,
        "targetTo": target_to,
        "targetLow": target_low,
        "targetHigh": target_high,
    }

    d_pq = dist[p][q]
    d_qp = dist[q][p]
    if d_pq is None or d_qp is None:
        # 目标间隙无界：平移一个无界区间没有意义，无法选配
        base["bounded"] = False
        base["feasible"] = False
        base["reason"] = "unbounded"
        base["message"] = (f"{target_from} → {target_to} 的原间隙最紧区间无界，"
                           "垫片只能整体平移区间、不能使其变界，无法选配。")
        return base

    low = -d_qp          # 原最紧下界 L
    high = d_pq          # 原最紧上界 U
    req_lo = target_low - low    # 所需净补偿量下界 A
    req_hi = target_high - high  # 所需净补偿量上界 B
    base.update({
        "bounded": True,
        "originalLow": low,
        "originalHigh": high,
        "requiredLow": req_lo,
        "requiredHigh": req_hi,
    })
    if req_lo > req_hi:
        base["feasible"] = False
        base["reason"] = "targetTooNarrow"
        base["message"] = (
            f"合格区间 [ {target_low} , {target_high} ] μm 容不下原最紧区间"
            f" [ {low} , {high} ] μm（长度 {high - low} μm），"
            "整体平移无法使其落入，垫片选配无解。")
        return base

    k = len(positions)
    # 前向分层 DP，状态键为当前有符号厚度和。状态值把 (最低成本, 最小字典序秩)
    # 打包为一个整数：编码 = 成本·RANK_MOD + 秩（秩 < 6^k = RANK_MOD，无进位），
    # 整数大小序即 (成本, 秩) 的字典序，同和合并与末层取最优都退化为整数比较。
    # 秩把已选选项序号（0 起）按安装位顺序编码为 6 进制数：处理第 t 位时
    # 加上 j·6^(k-1-t)。任意两条前 t 位选择不同的路径，其秩差至少 6^(k-t)，
    # 大于后缀 k−t 位所能贡献的最大增量 6^(k-t)−1，故“同成本取秩小”在
    # 中间层合并状态时与最终的选项序号向量字典序完全一致（后缀选择只依赖
    # 当前和，不依赖历史，故同和的劣势状态可安全丢弃）。剪枝：只保留
    # “后缀可达区间与所需区间有交”的状态（前缀 s 经后缀覆盖
    # [s+suf_lo, s+suf_hi]，与 [req_lo, req_hi] 不交即绝无可能命中）。
    # 层表示逐层重选、可双向切换：
    #   稀疏层：字典 {和: 编码}，只存实际可达的和，内存与状态数成正比；
    #   稠密层：偏移 + 一条平行数组（INF 哨兵表示该和不可达），下标即和，
    #           省去哈希开销，仅当保留跨度不超过 SPAN_LIMIT 且预计可达状态
    #           足够密（不少于跨度的 1/DENSE_FILL）时才使用。
    # 稀疏可达和绝不按整个整数跨度开数组（如选项厚度都是 2×10⁵ 的倍数时，
    # 保留跨度可达 10⁷ 而实际可达和仅数十个）；状态数上界是可达有符号和的
    # 个数而非 ∏选项数，故也不逐一枚举全部组合。
    INF = 1 << 60
    SPAN_LIMIT = 2_000_000
    DENSE_FILL = 8
    RANK_MOD = 6 ** k

    # 前缀位 0..t-1 有符号和的极值（纯函数，按位预算）
    pre_lo = [0] * (k + 1)
    pre_hi = [0] * (k + 1)
    for t, pos in enumerate(positions):
        d = pos["direction"]
        vals = [d * o["thickness"] for o in pos["options"]]
        pre_lo[t + 1] = pre_lo[t] + min(vals)
        pre_hi[t + 1] = pre_hi[t] + max(vals)

    suf0_lo, suf0_hi = _suffix_extrema(positions, 0)
    # 当前层：稀疏 cur_map（{和: 编码}）或稠密 cur_dense（(下标偏移, [编码])）
    # 二者恰有一个非 None；cur_count 为当前状态数（稠密层为非 INF 槽数），
    # 供下一层估计可达状态密度
    cur_map: dict[int, int] | None = (
        {0: 0} if suf0_lo <= req_hi and suf0_hi >= req_lo else {})
    cur_dense: tuple[int, list[int]] | None = None
    cur_count = len(cur_map)
    for t, pos in enumerate(positions):
        d = pos["direction"]
        s_lo, s_hi = _suffix_extrema(positions, t + 1)
        shift = 6 ** (k - t - 1)
        options = pos["options"]
        m = len(options)
        vals = [d * o["thickness"] for o in options]

        # 新层“保留和”区间：候选和理论区间（前缀整体区间 + 每位选项）与
        # 剪枝窗口 [req_lo−s_hi, req_hi−s_lo] 取交；可达和必落在该交集中，
        # 故稀疏、稠密两种表示下保留的状态集合一致
        span_min = pre_lo[t] + min(vals)
        span_max = pre_hi[t] + max(vals)
        keep_lo = max(span_min, req_lo - s_hi)
        keep_hi = min(span_max, req_hi - s_lo)
        if keep_lo > keep_hi:
            cur_map, cur_dense, cur_count = {}, None, 0   # 剪枝后已无可达状态
            continue
        width = keep_hi - keep_lo + 1
        # 逐层重选表示：保留跨度不大、且预计可达状态数（上界为
        # min(跨度, 当前状态数 × 本层选项数)）足够密集时才用稠密数组，
        # 否则用稀疏字典——稀疏大跨度时绝不按整个整数跨度开数组
        use_dense = (width <= SPAN_LIMIT
                     and min(width, cur_count * m) * DENSE_FILL >= width)

        # 上一层的 (前缀和, 编码) 迭代器：稠密源跳过 INF 槽，并按新保留
        # 区间裁剪扫描下标（区间外的和经本层任何选项都到不了保留区间），
        # 避免逐槽遍历
        if cur_dense is not None:
            old_base, ovals = cur_dense
            src_lo = max(0, keep_lo - max(vals) - old_base)
            src_hi = min(len(ovals) - 1, keep_hi - min(vals) - old_base)

            def state_iter(_lo=src_lo, _hi=src_hi):
                for si in range(_lo, _hi + 1):
                    v0 = ovals[si]
                    if v0 != INF:
                        yield old_base + si, v0
        else:
            def state_iter():
                yield from cur_map.items()

        if use_dense:
            offset = keep_lo
            avals = [INF] * width
            count = 0
            for s, v0 in state_iter():
                for j in range(m):
                    ni = s + vals[j] - offset
                    if ni < 0 or ni >= width:
                        continue
                    nv = v0 + options[j]["cost"] * RANK_MOD + j * shift
                    if nv < avals[ni]:
                        if avals[ni] == INF:
                            count += 1
                        avals[ni] = nv
            cur_map, cur_dense, cur_count = None, (offset, avals), count
        else:
            # 稀疏字典：只存实际可达的和，内存与状态数成正比
            nxt: dict[int, int] = {}
            for s, v0 in state_iter():
                for j in range(m):
                    ns = s + vals[j]
                    if ns + s_lo > req_hi or ns + s_hi < req_lo:
                        continue
                    nv = v0 + options[j]["cost"] * RANK_MOD + j * shift
                    old = nxt.get(ns)
                    if old is None or nv < old:
                        nxt[ns] = nv
            cur_map, cur_dense, cur_count = nxt, None, len(nxt)

    best_state = best_val = None
    if cur_dense is not None:
        offset, avals = cur_dense
        i0 = max(0, req_lo - offset)
        i1 = min(len(avals) - 1, req_hi - offset)
        for ni in range(i0, i1 + 1):
            v = avals[ni]
            if v != INF and (best_val is None or v < best_val):
                best_state, best_val = offset + ni, v
    else:
        for s, v in cur_map.items():
            if req_lo <= s <= req_hi and (best_val is None or v < best_val):
                best_state, best_val = s, v
    if best_state is None:
        base["feasible"] = False
        base["reason"] = "noCombination"
        base["message"] = (
            "没有任何一种垫片组合能使净补偿量落入所需区间"
            f" [ {req_lo} , {req_hi} ] μm（原最紧区间整体平移后落入"
            f" [ {target_low} , {target_high} ] μm 所要求的净补偿量），垫片选配无解。")
        return base

    # 编码解包：成本 = 编码 // RANK_MOD，秩 = 编码 % RANK_MOD；
    # 选项序号向量即秩的 6 进制各位（每位 0～选项数−1 < 6）
    best_cost, best_rank = divmod(best_val, RANK_MOD)
    choice = [(best_rank // 6 ** (k - 1 - t)) % 6 for t in range(k)]
    net = best_state
    adjusted_low = low + net
    adjusted_high = high + net

    selections = []
    for t, pos in enumerate(positions):
        j = choice[t]
        opt = pos["options"][j]
        selections.append({
            "position": t + 1,
            "direction": pos["direction"],
            "optionIndex": j + 1,             # 从 1 开始的选项序号
            "thickness": opt["thickness"],
            "cost": opt["cost"],
            "signedThickness": pos["direction"] * opt["thickness"],
            "optionCount": len(pos["options"]),
        })

    base.update({
        "feasible": True,
        "plan": {
            "netCompensation": net,
            "adjustedLow": adjusted_low,
            "adjustedHigh": adjusted_high,
            "totalCost": best_cost,
            "choiceVector": [j + 1 for j in choice],
            "selections": selections,
        },
        "message": (f"已选垫片组合：净补偿量 {net:+d} μm，调整后区间 "
                    f"[ {adjusted_low} , {adjusted_high} ] μm 完全落入合格区间"
                    f" [ {target_low} , {target_high} ] μm，总成本 {best_cost}。"),
    })
    return base


# ============================ 尺寸链改动影响 ============================

def classify_impact(lower_before: int | None, upper_before: int | None,
                    lower_after: int | None, upper_after: int | None) -> str:
    """前后最紧区间（None 表示该侧无界）的变化类别；调用方须保证前后不完全相同。

    有界↔无界的跃迁优先标出：旧有界新无界 -> becameUnbounded（变为无界），
    旧无界新有界 -> becameBounded（变为有界）；其余按区间包含关系（无界侧
    视为 ±∞）：新区间真包含于旧区间 -> tightened（收紧），旧区间真包含于
    新区间 -> loosened（放宽），互不包含 -> mixed（混合）。
    """
    old_bounded = lower_before is not None and upper_before is not None
    new_bounded = lower_after is not None and upper_after is not None
    if old_bounded and not new_bounded:
        return "becameUnbounded"
    if new_bounded and not old_bounded:
        return "becameBounded"

    def le_lower(a: int | None, b: int | None) -> bool:
        """下界 a ≤ b（None 视为 −∞）。"""
        if a is None:
            return True
        if b is None:
            return False
        return a <= b

    def le_upper(a: int | None, b: int | None) -> bool:
        """上界 a ≤ b（None 视为 +∞）。"""
        if b is None:
            return True
        if a is None:
            return False
        return a <= b

    # 新区间 ⊆ 旧区间 ⇔ 旧下界 ≤ 新下界 且 新上界 ≤ 旧上界（前后不同即真包含）
    if le_lower(lower_before, lower_after) and le_upper(upper_after, upper_before):
        return "tightened"
    if le_lower(lower_after, lower_before) and le_upper(upper_before, upper_after):
        return "loosened"
    return "mixed"


def chain_impact(points: list[str], base_constraints: list[dict],
                 draft_constraints: list[dict]) -> dict:
    """尺寸链改动影响：同一组基准点（名称与顺序相同）下基线与编辑稿的对比。

    两版各自判负权闭环：任一版矛盾即返回各矛盾版本的负环
    （baselineContradiction / draftContradiction），不生成点对差异。
    两版均一致时，按基准点录入顺序逐有序异点对 (p→q, p≠q) 比较最紧区间
    [−dist[q][p], dist[p][q]] 与无界状态，仅返回发生变化的点对（changes，
    含前后界——无界为 None——与变化类别 kind）。
    """
    n = len(points)
    base_edges = build_edges(points, base_constraints)
    draft_edges = build_edges(points, draft_constraints)
    base_cycle = find_negative_cycle(n, base_edges)
    draft_cycle = find_negative_cycle(n, draft_edges)
    if base_cycle is not None or draft_cycle is not None:
        result: dict = {"consistent": False, "points": points}
        if base_cycle is not None:
            result["baselineContradiction"] = \
                contradiction_payload(points, base_edges, base_cycle)
        if draft_cycle is not None:
            result["draftContradiction"] = \
                contradiction_payload(points, draft_edges, draft_cycle)
        return result

    base_dist = all_pairs_shortest(n, base_edges)
    draft_dist = all_pairs_shortest(n, draft_edges)
    changes: list[dict] = []
    for p in range(n):
        for q in range(n):
            if p == q:
                continue
            lower_before = None if base_dist[q][p] is None else -base_dist[q][p]
            upper_before = base_dist[p][q]
            lower_after = None if draft_dist[q][p] is None else -draft_dist[q][p]
            upper_after = draft_dist[p][q]
            if lower_before == lower_after and upper_before == upper_after:
                continue
            changes.append({
                "from": points[p],
                "to": points[q],
                "lowerBefore": lower_before,
                "upperBefore": upper_before,
                "lowerAfter": lower_after,
                "upperAfter": upper_after,
                "kind": classify_impact(lower_before, upper_before,
                                        lower_after, upper_after),
            })
    return {"consistent": True, "points": points, "changes": changes}


# ============================ 矛盾测量最小撤回 ============================

MAX_REMOVABLE = 16


def validate_removable(constraints: list[dict], raw_ids) -> list[str]:
    """校验可撤回编号列表，返回按录入顺序排列的编号；失败抛 ValueError(消息列表)。

    列表缺省（None）按空列表处理；元素须为已录入的测量编号（未知编号报错）、
    不得重复，去重后至多 MAX_REMOVABLE 条。
    """
    if raw_ids is None:
        return []
    if not isinstance(raw_ids, list):
        raise ValueError(["removableIds 必须为数组：元素为已录入的测量编号"])

    id_set = {c["id"] for c in constraints}
    errors: list[str] = []
    seen: set[str] = set()
    unknown: list[str] = []
    for j, rid in enumerate(raw_ids):
        cid = rid.strip() if isinstance(rid, str) else ""
        if not cid:
            errors.append(f"可撤回列表第 {j + 1} 项：编号为空或不是字符串")
            continue
        if cid not in id_set:
            unknown.append(cid)
            continue
        if cid in seen:
            errors.append(f"可撤回编号重复：{cid}")
            continue
        seen.add(cid)
    if unknown:
        errors.append("可撤回列表包含未录入的测量编号：" + "、".join(unknown))
    if len(seen) > MAX_REMOVABLE:
        errors.append(f"可撤回测量至多 {MAX_REMOVABLE} 条（当前 {len(seen)} 条）")
    if errors:
        raise ValueError(errors)
    order = {c["id"]: i for i, c in enumerate(constraints)}
    return sorted(seen, key=lambda cid: order[cid])


def min_removal(points: list[str], constraints: list[dict],
                removable_ids: list[str]) -> dict:
    """矛盾测量最小撤回：只允许删除可撤回测量，求使剩余清单一致的最少删除。

    - 原清单一致：返回空撤回集（removedIds 为空）；
    - 锁定测量（未标记可撤回）自身已含负权闭环：删除可撤回测量无法消除
      该闭环，返回不可修复及仅由锁定测量构成的负环；
    - 否则求使剩余清单一致的最少删除集合；并列时按原录入顺序取删除序号
      （从 1 开始的录入位置）列表字典序最小者。

    删除集合 D 可行 ⇔ 原图的每条负权闭环都至少含 D 中一条测量（最小碰集）。
    搜索不枚举删除子集：每次在当前图中找一条负环，只需删除环上某一条可撤回
    测量即可打破该环，故只沿环上的可撤回编号分支；并以“可撤回编号两两不交
    的负环打包”作为下界剪枝（打包出的每个环都需要一次互不相同的删除）。
    删除全部可撤回测量后只剩锁定测量（已验证一致），故解必然存在。
    """
    n = len(points)
    m = len(constraints)
    index_of = {c["id"]: i for i, c in enumerate(constraints)}
    removable_idx = sorted(index_of[cid] for cid in removable_ids)
    removable_set = set(removable_idx)
    base = {"points": points,
            "removableIds": [constraints[i]["id"] for i in removable_idx]}

    edges_full = build_edges(points, constraints)
    cycle_full = find_negative_cycle(n, edges_full)
    if cycle_full is None:
        # 原清单一致：空撤回集
        return {**base, "consistent": True, "removal": {
            "removedIds": [], "removedIndices": [], "removedCount": 0,
            "remainingIds": [c["id"] for c in constraints],
        }}
    original = contradiction_payload(points, edges_full, cycle_full)

    locked = [c for i, c in enumerate(constraints) if i not in removable_set]
    locked_edges = build_edges(points, locked)
    locked_cycle = find_negative_cycle(n, locked_edges)
    if locked_cycle is not None:
        # 锁定测量自身矛盾：任何撤回都无法修复
        return {**base, "consistent": False, "repairable": False,
                "originalContradiction": original,
                "contradiction": contradiction_payload(points, locked_edges,
                                                       locked_cycle)}

    # build_edges 按约束顺序每条追加两条边：约束 i 的边即 edges_full[2i:2i+2]
    cons_edges = [edges_full[2 * i: 2 * i + 2] for i in range(m)]

    def current_edges(deleted: frozenset) -> list[Edge]:
        es: list[Edge] = []
        for i in range(m):
            if i not in deleted:
                es += cons_edges[i]
        return es

    def packing_lower_bound(deleted: frozenset) -> int:
        """还需删除条数的下界：可撤回编号两两不交的负环个数。

        在“删去 deleted、且候选池外的可撤回约束也视为删去”的图中反复找负环，
        每找到一个就把环上可撤回约束移出候选池；这些环的可撤回集合两两不交，
        每个环都至少需要一次互不相同的删除。锁定部分一致（上方已验证），
        故找到的环上必有可撤回约束，循环必终止。
        """
        lb = 0
        pool = removable_set - deleted
        while True:
            es: list[Edge] = []
            for i in range(m):
                if i in deleted or (i in removable_set and i not in pool):
                    continue
                es += cons_edges[i]
            cyc = find_negative_cycle(n, es)
            if cyc is None:
                return lb
            lb += 1
            pool -= {index_of[es[ei].cid] for ei in cyc}

    best: list[int] = []

    def dfs(deleted: frozenset) -> None:
        nonlocal best
        if best and len(deleted) + packing_lower_bound(deleted) > len(best):
            return  # 下界已超过已知最优解
        es = current_edges(deleted)
        cyc = find_negative_cycle(n, es)
        if cyc is None:
            cand = sorted(deleted)
            if not best or (len(cand), cand) < (len(best), best):
                best = cand
            return
        if best and len(deleted) + 1 > len(best):
            return  # 再删一条即超过已知最优解
        # 只沿该负环上的可撤回编号分支（锁定部分一致，环上必有可撤回约束）
        branch = sorted({index_of[es[ei].cid] for ei in cyc}
                        & (removable_set - deleted))
        for i in branch:
            dfs(deleted | {i})

    dfs(frozenset())
    removed = best  # 删除全部可撤回测量必可行，best 必已赋值
    removed_set = set(removed)
    return {**base, "consistent": False, "repairable": True,
            "originalContradiction": original,
            "removal": {
                "removedIds": [constraints[i]["id"] for i in removed],
                "removedIndices": [i + 1 for i in removed],
                "removedCount": len(removed),
                "remainingIds": [c["id"] for i, c in enumerate(constraints)
                                 if i not in removed_set],
            }}


# ============================ 测量复核排程 ============================

MIN_INSPECTION_ITEMS = 1
MAX_INSPECTION_ITEMS = 16
MIN_DURATION = 1
MAX_DURATION = 1000
MIN_FAIL_PER_MILLE = 0
MAX_FAIL_PER_MILLE = 999


def validate_inspection_items(constraints: list[dict], raw_items) -> list[dict]:
    """校验复核排程条目，返回按原录入位置排序的规范化条目；失败抛 ValueError。

    每个条目：{id: 已录入测量编号, duration: 1～1000 整数,
               failPerMille: 0～999 整数, prerequisites: 所选测量编号列表}。
    条目数量 1～16；编号未知/重复、耗时或概率越界、前置依赖引用未选取的测量、
    依赖关系成环均报错。
    """
    if not isinstance(raw_items, list):
        raise ValueError(["复核条目 items 必须为对象数组"])
    if not (MIN_INSPECTION_ITEMS <= len(raw_items) <= MAX_INSPECTION_ITEMS):
        raise ValueError([f"复核测量数量须为 {MIN_INSPECTION_ITEMS}～"
                          f"{MAX_INSPECTION_ITEMS} 条（当前 {len(raw_items)}）"])

    index_of = {c["id"]: i for i, c in enumerate(constraints)}
    errors: list[str] = []
    chosen: list[dict] = []
    seen: set[str] = set()
    unknown: list[str] = []
    duplicate: list[str] = []
    for k, item in enumerate(raw_items):
        prefix = f"复核条目 {k + 1}"
        if not isinstance(item, dict):
            errors.append(f"{prefix}：格式不是对象")
            continue
        cid = item.get("id")
        cid = cid.strip() if isinstance(cid, str) else ""
        if not cid:
            errors.append(f"{prefix}：测量编号为空")
        elif cid not in index_of:
            unknown.append(cid or "（空编号）")
        elif cid in seen:
            duplicate.append(cid)
        else:
            seen.add(cid)

        duration = item.get("duration")
        if not isinstance(duration, int) or isinstance(duration, bool):
            errors.append(f"{prefix}（{cid or '无编号'}）：复核耗时必须为整数")
        elif not MIN_DURATION <= duration <= MAX_DURATION:
            errors.append(f"{prefix}（{cid or '无编号'}）：复核耗时须为 "
                          f"{MIN_DURATION}～{MAX_DURATION}（当前 {duration}）")

        fail_pm = item.get("failPerMille")
        if not isinstance(fail_pm, int) or isinstance(fail_pm, bool):
            errors.append(f"{prefix}（{cid or '无编号'}）：不合格概率必须为整数")
        elif not MIN_FAIL_PER_MILLE <= fail_pm <= MAX_FAIL_PER_MILLE:
            errors.append(f"{prefix}（{cid or '无编号'}）：不合格概率须为 "
                          f"{MIN_FAIL_PER_MILLE}～{MAX_FAIL_PER_MILLE}‰"
                          f"（当前 {fail_pm}）")

        raw_pre = item.get("prerequisites", [])
        pre_ids: list[str] = []
        if not isinstance(raw_pre, list):
            errors.append(f"{prefix}（{cid or '无编号'}）：前置依赖必须为编号数组")
        else:
            pre_seen: set[str] = set()
            for j, pre in enumerate(raw_pre):
                pid = pre.strip() if isinstance(pre, str) else ""
                if not pid:
                    errors.append(f"{prefix}（{cid or '无编号'}）：第 {j + 1} 个"
                                  "前置依赖编号为空或不是字符串")
                    continue
                if pid not in index_of:
                    errors.append(f"{prefix}（{cid or '无编号'}）：前置依赖 {pid} "
                                  "尚未录入")
                elif pid in pre_seen:
                    errors.append(f"{prefix}（{cid or '无编号'}）：前置依赖 {pid} 重复")
                else:
                    pre_seen.add(pid)
                    pre_ids.append(pid)
        chosen.append({"id": cid, "duration": duration,
                       "failPerMille": fail_pm, "prerequisiteIds": pre_ids})
    if unknown:
        errors.append("复核条目包含未录入的测量编号：" + "、".join(unknown))
    if duplicate:
        errors.append("复核测量编号重复选取：" + "、".join(duplicate))
    if errors:
        raise ValueError(errors)

    # 前置依赖只能引用所选测量
    for item in chosen:
        cid = item["id"]
        bad = [pid for pid in item["prerequisiteIds"] if pid not in seen]
        if bad:
            errors.append(f"复核测量 {cid}：前置依赖只能引用所选测量，"
                          "未选取的编号：" + "、".join(bad))
        if cid in item["prerequisiteIds"]:
            errors.append(f"复核测量 {cid}：不能依赖自身")
    if errors:
        raise ValueError(errors)

    # 依赖成环检测（DFS 三色标记，按原录入位置顺序访问）
    chosen_by_id = {item["id"]: item for item in chosen}
    color: dict[str, int] = {}   # 0=未访问 1=在当前递归栈 2=已完成
    stack_path: list[str] = []

    def visit(cur: str) -> list[str] | None:
        color[cur] = 1
        stack_path.append(cur)
        for pid in sorted(chosen_by_id[cur]["prerequisiteIds"],
                          key=lambda x: index_of[x]):
            if color.get(pid, 0) == 1:
                start = stack_path.index(pid)
                return stack_path[start:] + [pid]
            if color.get(pid, 0) == 0:
                cyc = visit(pid)
                if cyc is not None:
                    return cyc
        stack_path.pop()
        color[cur] = 2
        return None

    cycle = None
    for cid in sorted(chosen_by_id, key=lambda x: index_of[x]):
        if color.get(cid, 0) == 0:
            cycle = visit(cid)
            if cycle is not None:
                break
    if cycle is not None:
        raise ValueError(["前置依赖成环：" + " → ".join(cycle)])

    chosen.sort(key=lambda item: index_of[item["id"]])
    return chosen


def _terminating_decimal(value: Fraction) -> str:
    """把分母只含因子 2、5 的 Fraction 渲染为有尽小数字符串（整数无小数点）。"""
    sign = "-" if value < 0 else ""
    num, den = abs(value.numerator), value.denominator
    exp = 0
    while den % 10 == 0:
        den //= 10
        exp += 1
    twos = 0
    while den % 2 == 0:
        den //= 2
        twos += 1
    fives = 0
    while den % 5 == 0:
        den //= 5
        fives += 1
    assert den == 1, "复核排程的分数分母应只含因子 2、5"
    digits = max(twos, fives)
    num *= 2 ** (digits - twos) * 5 ** (digits - fives)
    scale = exp + digits
    if scale == 0:
        return sign + str(num)
    s = str(num).zfill(scale + 1)
    return f"{sign}{s[:-scale]}.{s[-scale:]}"


def _fraction_payload(value: Fraction) -> dict:
    """精确分数 -> {numerator, denominator, decimal}（decimal 为有尽小数）。"""
    return {"numerator": value.numerator, "denominator": value.denominator,
            "decimal": _terminating_decimal(value)}


def inspection_order(items: list[dict]) -> dict:
    """测量复核排程：求满足前置依赖、预期总耗时最小的完整复核顺序。

    按顺序 π_1..π_n 依次复核，第 k 步被执行当且仅当前 k−1 项全部合格，
    故预期总耗时
        E(π) = Σ_{k=1..n} d_{π_k} · Π_{j<k} (1 − p_{π_j}/1000)。
    子集 DP：G(S) 为“当前待复核集合恰为 S 时余下复核（即 S 中全部测量）
    的最优预期耗时”的分子（未约分，分母统一为 1000^|S|；首条 i 的耗时 d_i
    必发生，其后的一切只乘上合格率 (1000−p_i)/1000），则
        G(∅) = 0；
        G(S) = min_{i∈S, pre(i)∩S=∅} d_i·1000^|S| + (1000−p_i)·G(S∖{i})。
    分子大小序即期望耗时大小序（分母相同，且 1000^|S| > 0），故全程整数
    精确比较，不使用浮点。并列时比较完整顺序按原录入位置（从 1 开始）
    序号向量的字典序：候选顺序为 (pos_i) + 最优(S∖{i})，两个候选首项
    不同即由 pos_i 决定、首项相同则其后缀必为同一状态 S∖{i} 下唯一的
    字典序最优顺序，故只需在 G 相等时取 pos_i 较小者。
    """
    n = len(items)
    duration = [item["duration"] for item in items]
    pass_num = [1000 - item["failPerMille"] for item in items]
    positions = [i + 1 for i in range(n)]   # 原录入位置（1 起，互不相同）

    id_index = {item["id"]: i for i, item in enumerate(items)}
    pre_mask = [0] * n
    for i, item in enumerate(items):
        m = 0
        for pid in item["prerequisiteIds"]:
            m |= 1 << id_index[pid]
        pre_mask[i] = m

    size = 1 << n
    full = size - 1
    # 按子集大小升序处理：G(S) 只依赖 |S|−1 的状态
    masks_by_size: list[list[int]] = [[] for _ in range(n + 1)]
    for mask in range(size):
        masks_by_size[mask.bit_count()].append(mask)

    powers = [1]
    for _ in range(n):
        powers.append(powers[-1] * 1000)

    g = [0] * size          # G(∅)=0
    choice = [-1] * size    # 最优顺序的首项下标
    for ssize in range(1, n + 1):
        scale = powers[ssize]
        for mask in masks_by_size[ssize]:
            best_g = None
            best_choice = -1
            best_pos = -1
            m = mask
            while m:
                bit = m & -m
                i = bit.bit_length() - 1
                m ^= bit
                if pre_mask[i] & mask:
                    continue   # i 的前置依赖仍在集合内：i 此刻不能先复核
                val = duration[i] * scale + pass_num[i] * g[mask ^ bit]
                pos = positions[i]
                if (best_g is None or val < best_g
                        or (val == best_g and pos < best_pos)):
                    best_g, best_choice, best_pos = val, i, pos
            g[mask] = best_g
            choice[mask] = best_choice

    # 重建最优顺序
    order_idx: list[int] = []
    mask = full
    while mask:
        i = choice[mask]
        order_idx.append(i)
        mask ^= 1 << i

    # 逐步执行概率（此前各项均合格的概率）与该步对预期总耗时的贡献
    steps: list[dict] = []
    run_prob = Fraction(1)
    total_pass_num = 1
    for k, i in enumerate(order_idx):
        contribution = duration[i] * run_prob
        steps.append({
            "step": k + 1,
            "id": items[i]["id"],
            "position": positions[i],
            "duration": duration[i],
            "failPerMille": items[i]["failPerMille"],
            "prerequisiteIds": list(items[i]["prerequisiteIds"]),
            "runProbability": _fraction_payload(run_prob),
            "expectedContribution": _fraction_payload(contribution),
        })
        total_pass_num *= pass_num[i]
        run_prob = Fraction(total_pass_num, powers[k + 1])

    # G(全集)/1000^n 即最优预期总耗时（等于各步贡献之和）；约分后回显
    expected_total = Fraction(g[full], powers[n])

    return {
        "itemCount": n,
        "items": [
            {
                "id": items[i]["id"],
                "position": positions[i],
                "duration": duration[i],
                "failPerMille": items[i]["failPerMille"],
                "prerequisiteIds": list(items[i]["prerequisiteIds"]),
            }
            for i in range(n)
        ],
        "order": {
            "ids": [items[i]["id"] for i in order_idx],
            "positions": [positions[i] for i in order_idx],
        },
        "steps": steps,
        "expectedTotal": _fraction_payload(expected_total),
    }
