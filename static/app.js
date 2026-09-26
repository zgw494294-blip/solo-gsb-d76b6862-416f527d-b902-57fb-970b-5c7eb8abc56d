/* 装配尺寸链校验台 —— 前端逻辑（原生 JS） */
"use strict";

const STORAGE_KEY = "dimension-chain-bench-v1";

const EXAMPLES = {
  "1": {
    name: "线性尺寸链",
    points: ["A", "B", "C", "D"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 90, high: 100 },
      { id: "M02", from: "B", to: "C", low: 80, high: 90 },
      { id: "M03", from: "C", to: "D", low: 70, high: 80 }
    ],
    query: { from: "A", to: "D", targetLow: 235, targetHigh: 275 }
  },
  "2": {
    name: "负权闭环",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 30, high: 40 },
      { id: "M03", from: "A", to: "C", low: 69, high: 69 }
    ],
    query: null
  },
  "3": {
    name: "未连通与待复核",
    points: ["A", "B", "C", "E"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 100, high: 110 },
      { id: "M02", from: "B", to: "C", low: -5, high: 5 }
    ],
    query: { from: "A", to: "C", targetLow: 105, targetHigh: 110 }
  },
  "4": {
    name: "测量清单精简",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 10, high: 20 },
      { id: "M03", from: "A", to: "C", low: 20, high: 40 },
      { id: "M04", from: "A", to: "B", low: 5, high: 25 }
    ],
    query: null,
    autoSimplify: true
  },
  "5": {
    name: "容差预算（可修复）",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 30, high: 40 },
      { id: "M03", from: "A", to: "C", low: 69, high: 69 }
    ],
    steps: { M01: 1, M02: 1, M03: 0 },
    query: null,
    autoTolerance: true
  },
  "6": {
    name: "锁定测量矛盾（不可修复）",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "A", low: -5, high: 5 },
      { id: "M03", from: "B", to: "C", low: 0, high: 10 }
    ],
    steps: { M01: 0, M02: 0, M03: 1 },
    query: null,
    autoTolerance: true
  },
  "7": {
    name: "名义坐标拟合",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 10, high: 20 },
      { id: "M03", from: "A", to: "C", low: 35, high: 35 }
    ],
    nominals: { A: 0, B: 18, C: 30 },
    query: null,
    autoFit: true
  },
  "8": {
    name: "补测读数窗口",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 10, high: 20 }
    ],
    readingWindow: { from: "A", to: "B", targetFrom: "A", targetTo: "C", targetLow: 24, targetHigh: 36 },
    query: null,
    autoWindow: true
  },
  "9": {
    name: "垫片组合选配",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 10, high: 20 }
    ],
    query: null,
    shimPlan: { targetFrom: "A", targetTo: "C", targetLow: 24, targetHigh: 44 },
    positions: [
      { direction: 1, options: [
        { thickness: "10", cost: "5" },
        { thickness: "5", cost: "1" },
        { thickness: "8", cost: "3" }
      ]},
      { direction: -1, options: [
        { thickness: "6", cost: "1" },
        { thickness: "1", cost: "5" },
        { thickness: "3", cost: "2" }
      ]}
    ],
    autoShim: true
  },
  "10": {
    name: "尺寸链改动影响",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 12, high: 18 },
      { id: "M02", from: "B", to: "C", low: 5, high: 25 },
      { id: "M04", from: "A", to: "C", low: 24, high: 36 }
    ],
    impactBaseline: {
      points: ["A", "B", "C"],
      constraints: [
        { id: "M01", from: "A", to: "B", low: 10, high: 20 },
        { id: "M02", from: "B", to: "C", low: 10, high: 20 },
        { id: "M03", from: "A", to: "C", low: 20, high: 40 }
      ]
    },
    query: null,
    autoImpact: true
  },
  "11": {
    name: "矛盾测量最小撤回",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 30, high: 40 },
      { id: "M03", from: "A", to: "C", low: 69, high: 69 },
      { id: "M04", from: "C", to: "A", low: -60, high: -50 }
    ],
    removable: ["M01", "M02", "M03"],
    query: null,
    autoMinRemoval: true
  },
  "12": {
    name: "测量复核排程",
    points: ["A", "B", "C"],
    constraints: [
      { id: "M01", from: "A", to: "B", low: 10, high: 20 },
      { id: "M02", from: "B", to: "C", low: 10, high: 20 },
      { id: "M03", from: "A", to: "C", low: 20, high: 40 },
      { id: "M04", from: "A", to: "B", low: 5, high: 25 }
    ],
    inspection: {
      M01: { duration: "8", failPermille: "0", deps: "" },
      M02: { duration: "5", failPermille: "200", deps: "" },
      M03: { duration: "3", failPermille: "100", deps: "M02" },
      M04: { duration: "4", failPermille: "400", deps: "M01" }
    },
    query: null,
    autoInspection: true
  }
};

const VERDICT_TEXT = {
  pass: { label: "合格", desc: "约束推得的可行间隙全部落入目标合格区间。" },
  review: { label: "待复核", desc: "最紧区间与目标区间仅相交，存在不合格可能，请人工复核。" },
  fail: { label: "超差", desc: "最紧区间与目标区间不相交，任何可行装配均超差。" }
};

let state = {
  points: [],
  constraints: [],
  analysis: null,          // 最近一次成功分析结果
  editingId: null,
  simplify: null,          // 最近一次精简预览结果（录入变化后置空失效）
  steps: {},               // 测量编号 -> 步长（0~1000 整数，缺省 1；0 表示锁定）
  tolerance: null,         // 最近一次容差预算结果（录入或步长变化后置空失效）
  nominals: {},            // 基准点 -> 名义坐标（整数 μm，缺省 0）
  fit: null,               // 最近一次名义坐标拟合结果（点、测量或名义值变化后置空失效）
  window: null,            // 最近一次补测读数窗口结果（点、测量、补测点对或目标条件变化后置空失效）
  positions: [],           // 垫片安装位（有序，1～10 个）：{direction:1|-1, options:[{thickness,cost}]}（录入值保留字符串）
  shim: null,              // 最近一次垫片选配结果（点、测量、目标条件或安装位变化后置空失效）
  baseline: null,          // 已保存的对比基线 {points, constraints}（独立快照，重新保存即覆盖）
  impact: null,            // 最近一次改动影响报告（基线或编辑稿变化后置空失效）
  removable: {},           // 测量编号 -> true（标记为可撤回；缺省锁定，至多 16 条）
  minRemoval: null,        // 最近一次最小撤回预览（点、测量或标记变化后置空失效）
  inspSelected: {},        // 复核排程：测量编号 -> true（选取，至多 16 条）
  inspParams: {},          // 复核排程：测量编号 -> {duration, failPermille, deps}（录入值保留字符串）
  inspection: null,        // 最近一次复核排程结果（测量或排程参数变化后置空失效）
  query: { from: "", to: "", targetLow: "", targetHigh: "" },
  readingWindow: { from: "", to: "", targetFrom: "", targetTo: "", targetLow: "", targetHigh: "" },
  shimPlan: { targetFrom: "", targetTo: "", targetLow: "", targetHigh: "" }
};

const $ = (id) => document.getElementById(id);

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function signed(v) {
  return (v > 0 ? "+" : "") + v;
}
function parseIntStrict(raw) {
  const s = String(raw).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) ? n : null;
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      points: state.points,
      constraints: state.constraints,
      steps: state.steps,
      nominals: state.nominals,
      query: state.query,
      readingWindow: state.readingWindow,
      shimPlan: state.shimPlan,
      positions: state.positions,
      baseline: state.baseline,
      removable: state.removable,
      inspSelected: state.inspSelected,
      inspParams: state.inspParams
    }));
  } catch (e) { /* 忽略存储异常 */ }
}
function markDirty() {
  state.analysis = null;
  state.simplify = null;   // 录入变化后旧精简预览失效
  state.tolerance = null;  // 录入变化后旧预算结果失效
  state.fit = null;        // 录入变化后旧拟合结果失效
  state.window = null;     // 点/测量变化后旧补测窗口失效
  state.shim = null;       // 点/测量变化后旧垫片方案失效
  state.impact = null;     // 编辑稿变化后旧改动影响报告失效
  state.minRemoval = null; // 点/测量变化后旧最小撤回预览失效
  state.inspection = null; // 测量变化后旧复核排程结果失效
  const ids = new Set(state.constraints.map((c) => c.id));
  for (const id of Object.keys(state.steps)) {
    if (!ids.has(id)) delete state.steps[id];   // 清理已删除约束的步长
  }
  for (const id of Object.keys(state.removable)) {
    if (!ids.has(id)) delete state.removable[id];   // 清理已删除约束的可撤回标记
  }
  for (const id of Object.keys(state.inspSelected)) {
    if (!ids.has(id)) delete state.inspSelected[id];   // 清理已删除约束的排程选取
  }
  for (const id of Object.keys(state.inspParams)) {
    if (!ids.has(id)) delete state.inspParams[id];   // 清理已删除约束的排程参数
  }
  const pset = new Set(state.points);
  for (const p of Object.keys(state.nominals)) {
    if (!pset.has(p)) delete state.nominals[p]; // 清理已删除基准点的名义坐标
  }
  // 清理补测/目标下拉中已删除的点名
  for (const key of ["from", "to", "targetFrom", "targetTo"]) {
    if (state.readingWindow[key] && !pset.has(state.readingWindow[key])) {
      state.readingWindow[key] = "";
    }
  }
  for (const key of ["targetFrom", "targetTo"]) {
    if (state.shimPlan[key] && !pset.has(state.shimPlan[key])) {
      state.shimPlan[key] = "";
    }
  }
  persist();
  renderResults();
  renderSimplify();
  renderTolerance();
  renderFit();
  renderWindow();
  renderShimResult();
  renderImpact();
  renderMinRemoval();
  renderInspection();
}
async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let data = null;
  try { data = await resp.json(); } catch (e) { /* */ }
  return { ok: resp.ok, status: resp.status, data };
}
function showFormError(msg) {
  const box = $("formMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "请修正以下问题：<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearFormMessage() { $("formMessage").hidden = true; }
function showQueryError(msg) {
  const box = $("queryMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearQueryMessage() { $("queryMessage").hidden = true; }
function showSimplifyError(msg) {
  const box = $("simplifyMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearSimplifyMessage() { $("simplifyMessage").hidden = true; }
function showToleranceError(msg) {
  const box = $("toleranceMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearToleranceMessage() { $("toleranceMessage").hidden = true; }
function showFitError(msg) {
  const box = $("fitMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearFitMessage() { $("fitMessage").hidden = true; }
function showWindowError(msg) {
  const box = $("windowMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearWindowMessage() { $("windowMessage").hidden = true; }
function showShimError(msg) {
  const box = $("shimMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearShimMessage() { $("shimMessage").hidden = true; }
function showImpactError(msg) {
  const box = $("impactMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearImpactMessage() { $("impactMessage").hidden = true; }
function showMinRemovalError(msg) {
  const box = $("minRemovalMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearMinRemovalMessage() { $("minRemovalMessage").hidden = true; }
function showInspError(msg) {
  const box = $("inspMessage");
  box.hidden = false;
  box.className = "message error";
  box.innerHTML = Array.isArray(msg)
    ? "<ul>" + msg.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>"
    : esc(msg);
}
function clearInspMessage() { $("inspMessage").hidden = true; }

/* ---------------- 渲染：基准点 ---------------- */
function renderPoints() {
  $("pointCounter").textContent = `${state.points.length} / 30`;
  const ul = $("pointList");
  ul.innerHTML = state.points
    .map((p) => `<li class="chip">${esc(p)}<button data-point="${esc(p)}" title="删除">×</button></li>`)
    .join("");
}

/* ---------------- 渲染：下拉选项 ---------------- */
function fillSelect(sel, points, current) {
  sel.innerHTML = points.map((p) =>
    `<option value="${esc(p)}"${p === current ? " selected" : ""}>${esc(p)}</option>`).join("");
}
function syncSelects() {
  const prevFrom = $("cFrom").value, prevTo = $("cTo").value;
  fillSelect($("cFrom"), state.points, prevFrom);
  fillSelect($("cTo"), state.points, prevTo);
  if (!$("cFrom").value && state.points.length) $("cFrom").value = state.points[0];
  if (!$("cTo").value && state.points.length > 1) $("cTo").value = state.points[1];
  else if (!$("cTo").value && state.points.length === 1) $("cTo").value = state.points[0];

  fillSelect($("qFrom"), state.points, state.query.from);
  fillSelect($("qTo"), state.points, state.query.to);

  fillSelect($("wFrom"), state.points, state.readingWindow.from);
  fillSelect($("wTo"), state.points, state.readingWindow.to);
  fillSelect($("wTargetFrom"), state.points, state.readingWindow.targetFrom);
  fillSelect($("wTargetTo"), state.points, state.readingWindow.targetTo);
  fillSelect($("sTargetFrom"), state.points, state.shimPlan.targetFrom);
  fillSelect($("sTargetTo"), state.points, state.shimPlan.targetTo);
  const setIfEmpty = (sel, preferred) => {
    if (!sel.value && preferred !== undefined) sel.value = preferred;
  };
  setIfEmpty($("wFrom"), state.points[0]);
  setIfEmpty($("wTo"), state.points[1]);
  setIfEmpty($("wTargetFrom"), state.points[0]);
  setIfEmpty($("wTargetTo"), state.points[1]);
  setIfEmpty($("sTargetFrom"), state.points[0]);
  setIfEmpty($("sTargetTo"), state.points[1]);
}

/* ---------------- 渲染：约束表 ---------------- */
function renderConstraints() {
  $("constraintCounter").textContent = `${state.constraints.length} / 80`;
  const tbody = $("constraintTbody");
  tbody.innerHTML = state.constraints.map((c) => {
    const editing = state.editingId === c.id;
    return `<tr class="${editing ? "editing" : ""}">
      <td>${esc(c.id)}</td>
      <td>${esc(c.from)}</td>
      <td>${esc(c.to)}</td>
      <td class="num">${c.low}</td>
      <td class="num">${c.high}</td>
      <td><div class="ops">
        <button class="btn small" data-edit="${esc(c.id)}">编辑</button>
        <button class="btn small danger" data-del="${esc(c.id)}">删除</button>
      </div></td>
    </tr>`;
  }).join("");
  $("constraintEmpty").style.display = state.constraints.length ? "none" : "block";
  $("constraintTable").style.display = state.constraints.length ? "" : "none";
}

function renderAll() {
  renderPoints();
  syncSelects();
  renderConstraints();
  renderResults();
  renderTolerance();
  renderFit();
  renderWindow();
  renderPositions();
  renderShimResult();
  renderImpact();
  renderMinRemoval();
  renderInspection();
}

/* ---------------- 结果区 ---------------- */
function renderResults() {
  const box = $("analyzeResult");
  const ph = $("analyzePlaceholder");
  if (!state.analysis) {
    box.hidden = true;
    box.innerHTML = "";
    ph.hidden = false;
    ph.innerHTML = state.constraints.length || state.points.length
      ? "数据已就绪或已变更，请点击「运行一致性校验」"
      : "录入基准点与约束后点击「运行一致性校验」<br>系统将检查全部约束能否同时成立";
    $("queryResult").innerHTML = "";
    return;
  }
  ph.hidden = true;
  box.hidden = false;
  const a = state.analysis;
  if (a.consistent) {
    box.innerHTML = `
      <div class="verdict-banner pass"><span class="icon">✓</span>
        <div>全部约束可以同时成立（系统一致）
        <span class="sub">所有测量区间互不冲突，可在下方查询任意已连通两点的最紧间隙界。</span></div>
      </div>`;
  } else {
    box.innerHTML = renderContradiction(a.contradiction);
  }
}

function renderCycleBox(c) {
  const segs = c.segments;
  const startNode = segs[0].from;
  let chain = `<span class="cycle-node">${esc(startNode)}</span>`;
  for (const s of segs) {
    const boundText = s.usedBound === "upper" ? "上限" : "下限";
    chain += `<span class="cycle-edge">
        <span class="dir">→</span>
        <span>${signed(s.weight)}</span>
        <small>${esc(s.measurementId)} · ${boundText}</small>
      </span>
      <span class="cycle-node">${esc(s.to)}</span>`;
  }
  const rows = segs.map((s, i) => {
    const dirTag = s.direction === "forward"
      ? '<span class="tag fwd">正向</span>'
      : '<span class="tag rev">逆向</span>';
    const boundTag = s.usedBound === "upper"
      ? '<span class="tag upper">采用上限</span>'
      : '<span class="tag lower">采用下限</span>';
    const boundVal = s.usedBound === "upper" ? s.weight : -s.weight;
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(s.measurementId)}</td>
      <td>${dirTag}</td>
      <td>${esc(s.from)} → ${esc(s.to)}</td>
      <td>${boundTag} ${boundVal} μm</td>
      <td class="num">${signed(s.weight)}</td>
    </tr>`;
  }).join("");
  return `
    <div class="cycle-box">
      <div class="cycle-chain">${chain}</div>
      <div class="table-wrap cycle-table">
        <table class="data-table">
          <thead><tr><th>序</th><th>测量编号</th><th>方向</th><th>段</th><th>采用</th><th>权重</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="weight-sum">闭环权重和 =
        ${segs.map((s) => signed(s.weight)).join(" ")} = <b>${c.weightSum}</b> μm（&lt; 0，矛盾）
      </div>
    </div>`;
}

function renderContradiction(c) {
  return `
    <div class="verdict-banner fail"><span class="icon">✕</span>
      <div>发现矛盾：存在一条负权闭环
      <span class="sub">闭环权重和为负，约束互相冲突，无法同时成立；按规则不输出间隙结果。</span></div>
    </div>
    ${renderCycleBox(c)}`;
}

function renderRangeVis(targetLow, targetHigh, low, high) {
  const min = Math.min(targetLow, targetHigh, low, high);
  const max = Math.max(targetLow, targetHigh, low, high);
  const span = max - min;
  if (span === 0) {
    return `<div class="range-vis"><div class="track">
      <div class="range-band both" style="left:0;right:0">目标与最紧区间重合于 ${min} μm</div>
    </div></div>`;
  }
  const pct = (v) => ((v - min) / span) * 100;
  const band = (lo, hi, cls, label) => {
    const left = pct(lo);
    const width = Math.max(pct(hi) - left, 0.6);
    return `<div class="range-band ${cls}" style="left:${left}%;width:${width}%"
      title="${esc(label)}">${width > 12 ? esc(label) : ""}</div>`;
  };
  const ilo = Math.max(targetLow, low), ihi = Math.min(targetHigh, high);
  let html = `<div class="range-vis"><div class="track">`;
  html += band(targetLow, targetHigh, "target", `目标 ${targetLow}~${targetHigh}`);
  html += band(low, high, "tight", `最紧 ${low}~${high}`);
  if (ilo <= ihi) {
    html += band(ilo, ihi, "both", `相交 ${ilo}~${ihi}`);
  }
  html += `</div><div class="range-legend">
      <span><span class="swatch" style="background:rgba(31,111,178,.35)"></span>目标合格区间</span>
      <span><span class="swatch" style="background:rgba(192,57,43,.35)"></span>约束最紧区间</span>
      <span><span class="swatch" style="background:rgba(27,138,75,.4)"></span>相交部分</span>
    </div></div>`;
  return html;
}

function renderQueryResult(r) {
  const box = $("queryResult");
  if (!r.bounded) {
    box.innerHTML = `
      <div class="verdict-banner info"><span class="icon">∞</span>
        <div>${esc(r.from)} → ${esc(r.to)}：两点未连通，间隙无界
        <span class="sub">现有约束图中不存在连接两点的测量路径，推不出任何间隙界；按规则不判合格。</span></div>
      </div>`;
    return;
  }
  const v = VERDICT_TEXT[r.verdict];
  box.innerHTML = `
    <div class="verdict-banner ${r.verdict === "pass" ? "pass" : r.verdict === "fail" ? "fail" : "info"}">
      <span class="icon">${r.verdict === "pass" ? "✓" : r.verdict === "fail" ? "✕" : "⚠"}</span>
      <div>${esc(r.from)} → ${esc(r.to)}：<span class="badge ${r.verdict}">${v.label}</span>
        <span class="sub">${v.desc}</span></div>
    </div>
    <dl class="kv">
      <dt>约束推得的最紧间隙界</dt><dd>[ ${r.low} , ${r.high} ] μm</dd>
      <dt>目标合格区间</dt><dd>[ ${r.targetLow} , ${r.targetHigh} ] μm</dd>
    </dl>
    ${renderRangeVis(r.targetLow, r.targetHigh, r.low, r.high)}`;
}

/* ---------------- 测量清单精简 ---------------- */
function renderWitnessRange(w) {
  const before = `[ ${w.lowerBefore === null ? "−∞" : w.lowerBefore} , ${w.upperBefore === null ? "+∞" : w.upperBefore} ]`;
  const after = `[ ${w.lowerAfter === null ? "−∞" : w.lowerAfter} , ${w.upperAfter === null ? "+∞" : w.upperAfter} ]`;
  return { before, after };
}

function renderSimplify() {
  const box = $("simplifyResult");
  const s = state.simplify;
  if (!s) { box.innerHTML = ""; return; }
  const info = s.simplify;

  const removed = info.removableIds;
  const kept = info.retained;
  const banner = removed.length === 0
    ? `<div class="verdict-banner pass"><span class="icon">✓</span>
        <div>清单已无可删测量
        <span class="sub">逐条试删后，任一条约束删去都会改变至少一个点对的最紧界或无界状态；当前 ${kept.length} 条测量全部必要。</span></div>
      </div>`
    : `<div class="verdict-banner info"><span class="icon">✂</span>
        <div>可删去 ${removed.length} 条，保留 ${kept.length} 条
        <span class="sub">删去下列测量后，全部有序点对的最紧上下界与无界状态均与原清单一致；确认后可从编辑表移除。</span></div>
      </div>`;

  const remList = removed.length
    ? `<div class="chip-row">${removed.map((id) =>
        `<span class="chip removable">${esc(id)}<span class="tag-del">可删</span></span>`).join("")}</div>`
    : "";

  const witRows = kept.map((r) => {
    const w = r.witness;
    const rg = renderWitnessRange(w);
    const change = w.changedSide === "unbounded"
      ? '<span class="tag unb">变为无界</span>'
      : '<span class="tag loose">界值放松</span>';
    return `<tr>
      <td>${esc(r.id)}</td>
      <td>${esc(w.from)} → ${esc(w.to)}</td>
      <td class="num">${rg.before}</td>
      <td class="cell-arrow">→</td>
      <td class="num">${rg.after} ${change}</td>
    </tr>`;
  }).join("");

  box.innerHTML = `
    ${banner}
    ${remList}
    <div class="table-wrap simp-table">
      <table class="data-table">
        <thead><tr><th>保留编号</th><th>再删时首个变化点对</th><th>删前界</th><th></th><th>删后界</th></tr></thead>
        <tbody>${witRows}</tbody>
      </table>
    </div>
    <p class="simp-note">点对按基准点录入顺序查找；保留集合已不可再删。</p>
    ${removed.length ? `<div class="row simp-actions">
      <button class="btn primary" id="applySimplifyBtn">确认移除上述 ${removed.length} 条可删测量</button>
    </div>` : ""}`;

  const applyBtn = $("applySimplifyBtn");
  if (applyBtn) applyBtn.addEventListener("click", applySimplify);
}

/* ---------------- 基准点操作 ---------------- */
function addPoint() {
  clearFormMessage();
  const input = $("pointName");
  const name = input.value.trim();
  if (!name) return showFormError("基准点名称不能为空。");
  if (state.points.includes(name)) return showFormError(`基准点 ${name} 已存在，名称必须唯一。`);
  if (state.points.length >= 30) return showFormError("基准点最多 30 个。");
  state.points.push(name);
  input.value = "";
  markDirty();
  renderAll();
  persist();
  input.focus();
}

function deletePoint(name) {
  const used = state.constraints
    .filter((c) => c.from === name || c.to === name)
    .map((c) => c.id);
  if (used.length) {
    showFormError(`基准点 ${name} 仍被约束 ${used.join("、")} 引用，请先删除或修改这些约束。`);
    return;
  }
  state.points = state.points.filter((p) => p !== name);
  markDirty();
  renderAll();
}

/* ---------------- 约束操作 ---------------- */
function nextAutoId() {
  for (let i = 1; i <= 99; i++) {
    const id = "M" + String(i).padStart(2, "0");
    if (!state.constraints.some((c) => c.id === id)) return id;
  }
  return "M" + Date.now();
}
function resetConstraintForm() {
  state.editingId = null;
  $("cId").value = "";
  $("cLow").value = "";
  $("cHigh").value = "";
  $("saveConstraintBtn").textContent = "添加约束";
  $("cancelEditBtn").classList.add("hidden");
  if (state.points.length) $("cFrom").value = state.points[0];
  if (state.points.length > 1) $("cTo").value = state.points[1];
  renderConstraints();
}

function readConstraintForm() {
  const errors = [];
  let id = $("cId").value.trim();
  if (!id) id = state.editingId || nextAutoId();
  if (state.constraints.some((c) => c.id === id && c.id !== state.editingId)) {
    errors.push(`编号 ${id} 已存在，约束编号必须唯一。`);
  }
  if (state.points.length < 2) errors.push("请先录入至少 2 个基准点。");
  const from = $("cFrom").value, to = $("cTo").value;
  if (from === to) errors.push("起点与终点必须为两个不同的已录入点。");
  const low = parseIntStrict($("cLow").value);
  const high = parseIntStrict($("cHigh").value);
  if (low === null) errors.push("下限必须填写整数（微米）。");
  if (high === null) errors.push("上限必须填写整数（微米）。");
  if (low !== null && Math.abs(low) > 1e9) errors.push("下限超出 ±1000000000。");
  if (high !== null && Math.abs(high) > 1e9) errors.push("上限超出 ±1000000000。");
  if (low !== null && high !== null && low > high) errors.push(`下限 ${low} 不能大于上限 ${high}。`);
  if (errors.length) { showFormError(errors); return null; }
  return { id, from, to, low, high };
}

function saveConstraint() {
  clearFormMessage();
  const data = readConstraintForm();
  if (!data) return;
  if (state.editingId) {
    const i = state.constraints.findIndex((c) => c.id === state.editingId);
    state.constraints[i] = data;
  } else {
    if (state.constraints.length >= 80) return showFormError("测量约束最多 80 条。");
    state.constraints.push(data);
  }
  resetConstraintForm();
  markDirty();
  renderAll();
}

function editConstraint(id) {
  const c = state.constraints.find((x) => x.id === id);
  if (!c) return;
  clearFormMessage();
  state.editingId = id;
  $("cId").value = c.id;
  $("cFrom").value = c.from;
  $("cTo").value = c.to;
  $("cLow").value = c.low;
  $("cHigh").value = c.high;
  $("saveConstraintBtn").textContent = "保存修改";
  $("cancelEditBtn").classList.remove("hidden");
  renderConstraints();
  $("cId").focus();
}

function deleteConstraint(id) {
  state.constraints = state.constraints.filter((c) => c.id !== id);
  if (state.editingId === id) resetConstraintForm();
  markDirty();
  renderAll();
}

/* ---------------- 一致性分析 ---------------- */
async function runAnalyze() {
  clearFormMessage();
  if (state.points.length < 2) return showFormError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showFormError("请至少录入 1 条测量约束。");
  const btn = $("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "校验中…";
  const { ok, data } = await postJSON("/api/analyze", {
    points: state.points,
    constraints: state.constraints
  });
  btn.disabled = false;
  btn.textContent = "③ 运行一致性校验";
  if (!ok) {
    state.analysis = null;
    renderResults();
    showFormError(data && data.detail ? data.detail : "校验请求失败。");
    return;
  }
  state.analysis = data;
  $("queryResult").innerHTML = "";
  renderResults();
}

/* ---------------- 间隙查询 ---------------- */
async function runQuery() {
  clearQueryMessage();
  const from = $("qFrom").value, to = $("qTo").value;
  const targetLow = parseIntStrict($("qTargetLow").value);
  const targetHigh = parseIntStrict($("qTargetHigh").value);
  const errors = [];
  if (state.points.length < 2) errors.push("请先录入基准点。");
  if (!from) errors.push("请选择起点。");
  if (!to) errors.push("请选择终点。");
  if (from && to && from === to) errors.push("查询的两个点必须不同。");
  if (targetLow === null) errors.push("目标下限必须为整数。");
  if (targetHigh === null) errors.push("目标上限必须为整数。");
  if (targetLow !== null && targetHigh !== null && targetLow > targetHigh) {
    errors.push(`目标下限 ${targetLow} 不能大于上限 ${targetHigh}。`);
  }
  if (errors.length) return showQueryError(errors);

  state.query = { from, to, targetLow: $("qTargetLow").value.trim(), targetHigh: $("qTargetHigh").value.trim() };
  persist();

  const { ok, status, data } = await postJSON("/api/query", {
    points: state.points,
    constraints: state.constraints,
    from, to, targetLow, targetHigh
  });
  if (ok) {
    renderQueryResult(data);
    return;
  }
  $("queryResult").innerHTML = "";
  if (status === 409 && data && data.analysis) {
    state.analysis = data.analysis;
    renderResults();
    showQueryError("当前约束存在矛盾闭环，系统不输出间隙结果，请先查看左侧矛盾详情并消除矛盾。");
  } else {
    showQueryError(data && data.detail ? data.detail : "查询请求失败。");
  }
}

/* ---------------- 测量清单精简 ---------------- */
async function runSimplify() {
  clearSimplifyMessage();
  if (state.points.length < 2) return showSimplifyError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showSimplifyError("请至少录入 1 条测量约束。");
  const btn = $("simplifyBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/simplify", {
    points: state.points,
    constraints: state.constraints
  });
  btn.disabled = false;
  btn.textContent = "生成精简预览";
  if (!ok) {
    state.simplify = null;
    renderSimplify();
    return showSimplifyError(data && data.detail ? data.detail : "精简请求失败。");
  }
  if (!data.consistent) {
    // 矛盾输入：只显示现有负环，不给精简清单
    state.simplify = null;
    state.analysis = data;
    renderResults();
    renderSimplify();
    return showSimplifyError("当前约束存在矛盾闭环，系统只显示负环证据，不提供精简清单，请先消除矛盾。");
  }
  state.analysis = { consistent: true, points: state.points };
  state.simplify = data;
  renderResults();
  renderSimplify();
}

function applySimplify() {
  if (!state.simplify) return;
  const removable = new Set(state.simplify.simplify.removableIds);
  if (!removable.size) return;
  state.constraints = state.constraints.filter((c) => !removable.has(c.id));
  if (state.editingId && removable.has(state.editingId)) resetConstraintForm();
  // 编辑表已变化：旧预览失效，按新清单重新校验
  markDirty();
  renderConstraints();
  clearSimplifyMessage();
  runAnalyze();
}

/* ---------------- 测量容差预算 ---------------- */
function renderStepTable() {
  const tbody = $("stepTbody");
  const has = state.constraints.length > 0;
  $("stepEmpty").style.display = has ? "none" : "block";
  $("stepTable").style.display = has ? "" : "none";
  if (!has) { tbody.innerHTML = ""; return; }
  tbody.innerHTML = state.constraints.map((c) => {
    const raw = state.steps[c.id] !== undefined ? String(state.steps[c.id]) : "1";
    const v = parseIntStrict(raw);
    const invalid = v === null || v < 0 || v > 1000;
    return `<tr>
      <td>${esc(c.id)}</td>
      <td class="num">[ ${c.low} , ${c.high} ]</td>
      <td><input type="number" class="input step-input${invalid ? " bad" : ""}"
           data-step-for="${esc(c.id)}" min="0" max="1000" step="1" value="${esc(raw)}"></td>
      <td class="step-lock">${v === 0 ? '<span class="tag lock">锁定</span>' : ""}</td>
    </tr>`;
  }).join("");
}

function renderToleranceResult() {
  const box = $("toleranceResult");
  const t = state.tolerance;
  if (!t) { box.innerHTML = ""; return; }
  if (!t.repairable) {
    box.innerHTML = `
      <div class="verdict-banner fail"><span class="icon">✕</span>
        <div>不可修复：锁定测量（步长 0）自身矛盾
        <span class="sub">锁定区间不随预算 k 放宽，下列负权闭环对任意 k 都成立，整张清单无法通过放宽修复。</span></div>
      </div>
      ${renderCycleBox(t.contradiction)}`;
    return;
  }
  if (t.k === 0) {
    box.innerHTML = `
      <div class="verdict-banner pass"><span class="icon">✓</span>
        <div>最小预算 k = 0：原清单已一致
        <span class="sub">无需任何放宽，全部测量区间按原样即可同时成立。</span></div>
      </div>`;
    return;
  }
  const rows = t.adjusted.map((a) => `<tr>
      <td>${esc(a.id)}</td>
      <td class="num">${a.step}</td>
      <td class="num">[ ${a.low} , ${a.high} ]</td>
      <td class="num"><b>[ ${a.adjustedLow} , ${a.adjustedHigh} ]</b></td>
    </tr>`).join("");
  box.innerHTML = `
    <div class="verdict-banner info"><span class="icon">±</span>
      <div>最小预算 k = ${t.k}
      <span class="sub">k = ${t.k - 1} 时仍存在负权闭环；放宽到 k = ${t.k} 后整张清单首次一致（调整后区间允许超出原始录入范围）。</span></div>
    </div>
    <p class="tol-title">证据一 · k = ${t.k - 1} 时的负权闭环（仍矛盾，权重已按 k = ${t.k - 1} 放宽）</p>
    ${renderCycleBox(t.previousContradiction)}
    <p class="tol-title">证据二 · k = ${t.k} 时每条测量的调整后区间</p>
    <div class="table-wrap tol-table">
      <table class="data-table">
        <thead><tr><th>编号</th><th>步长</th><th>原区间 μm</th><th>调整后区间 μm</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderTolerance() {
  renderStepTable();
  renderToleranceResult();
}

async function runTolerance() {
  clearToleranceMessage();
  if (state.points.length < 2) return showToleranceError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showToleranceError("请至少录入 1 条测量约束。");
  const steps = {};
  const errs = [];
  for (const c of state.constraints) {
    const raw = state.steps[c.id] !== undefined ? state.steps[c.id] : "1";
    const v = parseIntStrict(raw);
    if (v === null) errs.push(`测量 ${c.id}：步长必须为整数。`);
    else if (v < 0 || v > 1000) errs.push(`测量 ${c.id}：步长须为 0～1000（当前 ${v}）。`);
    else steps[c.id] = v;
  }
  if (errs.length) return showToleranceError(errs);

  const btn = $("toleranceBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/tolerance", {
    points: state.points,
    constraints: state.constraints,
    steps
  });
  btn.disabled = false;
  btn.textContent = "计算最小预算";
  if (!ok) {
    state.tolerance = null;
    renderToleranceResult();
    return showToleranceError(data && data.detail ? data.detail : "容差预算请求失败。");
  }
  state.tolerance = data;
  renderToleranceResult();
}

/* ---------------- 名义坐标拟合 ---------------- */
function renderNominalTable() {
  const tbody = $("nominalTbody");
  const has = state.points.length > 0;
  $("nominalEmpty").style.display = has ? "none" : "block";
  $("nominalTable").style.display = has ? "" : "none";
  if (!has) { tbody.innerHTML = ""; return; }
  tbody.innerHTML = state.points.map((p, i) => {
    const raw = state.nominals[p] !== undefined ? String(state.nominals[p]) : "0";
    const v = parseIntStrict(raw);
    const invalid = v === null || Math.abs(v) > 1e9;
    return `<tr>
      <td>${esc(p)}</td>
      <td><input type="number" class="input nominal-input${invalid ? " bad" : ""}"
           data-nominal-for="${esc(p)}" step="1" value="${esc(raw)}"></td>
      <td class="nominal-anchor">${i === 0 ? '<span class="tag anchor">锚点 · 实际固定 0</span>' : ""}</td>
    </tr>`;
  }).join("");
}

function renderFitResult() {
  const box = $("fitResult");
  const f = state.fit;
  if (!f) { box.innerHTML = ""; return; }
  const fit = f.fit;
  const rows = fit.coordinates.map((r, i) => {
    const isMax = fit.maxDeviation > 0 && Math.abs(r.deviation) === fit.maxDeviation;
    return `<tr>
      <td>${esc(r.point)}${i === 0 ? ' <span class="tag anchor">锚点</span>' : ""}</td>
      <td class="num">${r.nominal}</td>
      <td class="num"><b>${r.actual}</b></td>
      <td class="num">${signed(r.deviation)} ${isMax ? '<span class="tag devmax">|偏差| = D</span>' : ""}</td>
    </tr>`;
  }).join("");
  const perfect = fit.maxDeviation === 0;
  box.innerHTML = `
    <div class="verdict-banner ${perfect ? "pass" : "info"}"><span class="icon">${perfect ? "✓" : "±"}</span>
      <div>${perfect ? "完全贴合名义坐标：" : ""}最大绝对偏差 D = ${fit.maxDeviation} μm
      <span class="sub">在满足全部测量的整数坐标方案中 D 已最小；同为最小 D 时按基准点录入顺序取坐标向量字典序最小者。首个基准点实际坐标固定为 0。</span></div>
    </div>
    <div class="table-wrap fit-table">
      <table class="data-table">
        <thead><tr><th>基准点</th><th>名义坐标 μm</th><th>实际坐标 μm</th><th>偏差（实际−名义）μm</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderFit() {
  renderNominalTable();
  renderFitResult();
}

async function runFit() {
  clearFitMessage();
  if (state.points.length < 2) return showFitError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showFitError("请至少录入 1 条测量约束。");
  const nominals = {};
  const errs = [];
  for (const p of state.points) {
    const raw = state.nominals[p] !== undefined ? state.nominals[p] : "0";
    const v = parseIntStrict(raw);
    if (v === null) errs.push(`基准点 ${p}：名义坐标必须为整数。`);
    else if (Math.abs(v) > 1e9) errs.push(`基准点 ${p}：名义坐标须在 ±1000000000 以内（当前 ${v}）。`);
    else nominals[p] = v;
  }
  if (errs.length) return showFitError(errs);

  const btn = $("fitBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/coordinate-fit", {
    points: state.points,
    constraints: state.constraints,
    nominals
  });
  btn.disabled = false;
  btn.textContent = "计算拟合方案";
  if (!ok) {
    state.fit = null;
    renderFitResult();
    return showFitError(data && data.detail ? data.detail : "拟合请求失败。");
  }
  if (!data.consistent) {
    // 矛盾输入：只显示现有负环，不给拟合方案
    state.fit = null;
    state.analysis = data;
    renderResults();
    renderFitResult();
    return showFitError("当前约束存在矛盾闭环，系统只显示负环证据，不提供拟合方案，请先消除矛盾。");
  }
  state.analysis = { consistent: true, points: state.points };
  state.fit = data;
  renderResults();
  renderFitResult();
}

/* ---------------- 补测读数窗口 ---------------- */
function formatWindow(w) {
  if (w.low === w.high) return `${w.low}`;
  return `[ ${w.low} , ${w.high} ]`;
}

function renderWindowResult() {
  const box = $("windowResult");
  const win = state.window;
  if (!win) { box.innerHTML = ""; return; }
  const ws = win.windows;
  if (!ws.length) {
    box.innerHTML = `
      <div class="verdict-banner fail"><span class="icon">∅</span>
        <div>无可用补测读数
        <span class="sub">在 [ ${win.rangeLow} , ${win.rangeHigh} ] 的全部整数读数中，没有任何一个能同时满足“加入后清单一致”且“${esc(win.targetFrom)} → ${esc(win.targetTo)} 的最紧间隙界有界并完全落入 [ ${win.targetLow} , ${win.targetHigh} ] μm”。请放宽合格区间或改选点对。</span></div>
      </div>`;
    return;
  }
  const total = ws.reduce((s, w) => s + (w.high - w.low + 1), 0);
  const chips = ws.map((w) =>
    `<li class="window-item">${esc(formatWindow(w))}<small>${w.high - w.low + 1} 个整数</small></li>`).join("");
  const rangeNote = ws.length === 1 && ws[0].low === win.rangeLow && ws[0].high === win.rangeHigh
    ? "全部读数均合格" : `共 ${ws.length} 段互不相邻的极大整数闭区间（区间之间至少隔开 1 个整数），合计 ${total} 个可用读数`;
  box.innerHTML = `
    <div class="verdict-banner pass"><span class="icon">✓</span>
      <div>可用补测读数窗口：${ws.length} 段
      <span class="sub">${esc(rangeNote)}；任取窗口内整数 r 作为 ${esc(win.from)} → ${esc(win.to)} 的精确补测读数 [r, r]，加入后清单一致，且 ${esc(win.targetFrom)} → ${esc(win.targetTo)} 的最紧间隙界有界并完全落入 [ ${win.targetLow} , ${win.targetHigh} ] μm。</span></div>
    </div>
    <ul class="window-list">${chips}</ul>`;
}

function renderWindow() {
  renderWindowResult();
}

async function runWindow() {
  clearWindowMessage();
  if (state.points.length < 2) return showWindowError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showWindowError("请至少录入 1 条测量约束。");
  const from = $("wFrom").value, to = $("wTo").value;
  const targetFrom = $("wTargetFrom").value, targetTo = $("wTargetTo").value;
  const targetLow = parseIntStrict($("wTargetLow").value);
  const targetHigh = parseIntStrict($("wTargetHigh").value);
  const errors = [];
  if (!from) errors.push("请选择补测起点。");
  if (!to) errors.push("请选择补测终点。");
  if (from && to && from === to) errors.push("拟补测的两个基准点必须不同。");
  if (!targetFrom) errors.push("请选择目标起点。");
  if (!targetTo) errors.push("请选择目标终点。");
  if (targetFrom && targetTo && targetFrom === targetTo) errors.push("目标点对的两个点必须不同。");
  if (targetLow === null) errors.push("目标下限必须为整数。");
  if (targetHigh === null) errors.push("目标上限必须为整数。");
  if (targetLow !== null && Math.abs(targetLow) > 1e9) errors.push("目标下限超出 ±1000000000。");
  if (targetHigh !== null && Math.abs(targetHigh) > 1e9) errors.push("目标上限超出 ±1000000000。");
  if (targetLow !== null && targetHigh !== null && targetLow > targetHigh) {
    errors.push(`目标下限 ${targetLow} 不能大于上限 ${targetHigh}。`);
  }
  if (errors.length) return showWindowError(errors);

  state.readingWindow = {
    from, to, targetFrom, targetTo,
    targetLow: $("wTargetLow").value.trim(),
    targetHigh: $("wTargetHigh").value.trim()
  };
  persist();

  const btn = $("windowBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/reading-window", {
    points: state.points,
    constraints: state.constraints,
    from, to, targetFrom, targetTo, targetLow, targetHigh
  });
  btn.disabled = false;
  btn.textContent = "计算补测读数窗口";
  if (!ok) {
    state.window = null;
    renderWindowResult();
    return showWindowError(data && data.detail ? data.detail : "补测读数窗口请求失败。");
  }
  if (!data.consistent) {
    // 原清单矛盾：只显示现有负环，不给出补测窗口
    state.window = null;
    state.analysis = data;
    renderResults();
    renderWindowResult();
    return showWindowError("当前约束存在矛盾闭环，系统只显示现有负环证据，不提供补测读数窗口，请先消除矛盾。");
  }
  state.analysis = { consistent: true, points: state.points };
  state.window = data;
  renderResults();
  renderWindowResult();
}

/* ---------------- 垫片组合选配 ---------------- */
function defaultPosition() {
  return { direction: 1, options: [{ thickness: "", cost: "" }] };
}

function renderPositions() {
  const wrap = $("positionsWrap");
  $("positionCounter").textContent = `${state.positions.length} / 10`;
  $("positionEmpty").style.display = state.positions.length ? "none" : "block";
  $("addPositionBtn").disabled = state.positions.length >= 10;
  wrap.innerHTML = state.positions.map((pos, pi) => {
    const dirTag = pos.direction === -1
      ? '<span class="tag neg">方向 −1（反向）</span>'
      : '<span class="tag pos">方向 +1（正向）</span>';
    const rows = pos.options.map((opt, oi) => {
      const t = parseIntStrict(opt.thickness);
      const c = parseIntStrict(opt.cost);
      const tBad = opt.thickness !== "" && (t === null || t < 0 || t > 1e6);
      const cBad = opt.cost !== "" && (c === null || c < 0 || c > 1000);
      return `<tr>
        <td class="num"><span class="opt-pick">${oi + 1}</span></td>
        <td><input type="number" class="input opt-input${tBad ? " bad" : ""}"
             data-opt-field="thickness" data-pos="${pi}" data-opt="${oi}"
             min="0" max="1000000" step="1" value="${esc(opt.thickness)}"
             placeholder="0～10⁶"></td>
        <td><input type="number" class="input opt-input${cBad ? " bad" : ""}"
             data-opt-field="cost" data-pos="${pi}" data-opt="${oi}"
             min="0" max="1000" step="1" value="${esc(opt.cost)}"
             placeholder="0～1000"></td>
        <td class="num option-signed">${t === null ? "—" : signed(pos.direction * t)}</td>
        <td><button class="btn tiny danger" data-opt-del data-pos="${pi}" data-opt="${oi}"
             ${pos.options.length <= 1 ? "disabled title='每位至少保留 1 个选项'" : ""}>删除</button></td>
      </tr>`;
    }).join("");
    return `<div class="position-card" data-position-card="${pi}">
      <div class="position-head">
        <span class="pos-title">安装位 ${pi + 1}</span>
        <label class="pos-field">方向
          <select class="input dir-select" data-pos-dir="${pi}">
            <option value="1"${pos.direction === 1 ? " selected" : ""}>+1</option>
            <option value="-1"${pos.direction === -1 ? " selected" : ""}>−1</option>
          </select>
        </label>
        ${dirTag}
        <span class="spacer"></span>
        <button class="btn tiny" data-opt-add data-pos="${pi}"
          ${pos.options.length >= 6 ? "disabled" : ""}>＋ 添加选项</button>
        <button class="btn tiny danger" data-pos-del="${pi}">删除安装位</button>
      </div>
      <table class="option-table">
        <thead><tr><th>序号</th><th>厚度 μm（0～10⁶ 整数）</th><th>成本（0～1000 整数）</th><th>有符号厚度</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join("");
}

function invalidateShim() {
  state.shim = null;
  clearShimMessage();
  renderShimResult();
  persist();
}

function renderShimResult() {
  const box = $("shimResult");
  const r = state.shim;
  if (!r) { box.innerHTML = ""; return; }

  if (!r.consistent) {
    box.innerHTML = renderContradiction(r.contradiction);
    return;
  }
  if (!r.bounded) {
    box.innerHTML = `
      <div class="verdict-banner fail"><span class="icon">∞</span>
        <div>无法选配：${esc(r.targetFrom)} → ${esc(r.targetTo)} 的原间隙无界
        <span class="sub">${esc(r.message)}</span></div>
      </div>`;
    return;
  }
  if (!r.feasible) {
    box.innerHTML = `
      <div class="verdict-banner fail"><span class="icon">∅</span>
        <div>垫片选配无解
        <span class="sub">${esc(r.message)}</span></div>
      </div>
      <dl class="kv">
        <dt>原最紧间隙区间</dt><dd>[ ${r.originalLow} , ${r.originalHigh} ] μm</dd>
        <dt>目标合格区间</dt><dd>[ ${r.targetLow} , ${r.targetHigh} ] μm</dd>
        <dt>所需净补偿量</dt><dd>[ ${r.requiredLow} , ${r.requiredHigh} ] μm</dd>
      </dl>`;
    return;
  }

  const p = r.plan;
  const rows = p.selections.map((s) => `<tr>
      <td>${s.position}</td>
      <td><span class="tag ${s.direction === 1 ? "pos" : "neg"}">${signed(s.direction)}</span></td>
      <td class="num"><b>${s.optionIndex}</b> / ${s.optionCount}</td>
      <td class="num">${s.thickness}</td>
      <td class="num">${signed(s.signedThickness)}</td>
      <td class="num">${s.cost}</td>
    </tr>`).join("");
  const vec = p.choiceVector.map((x) => `<li>${x}</li>`).join("");
  box.innerHTML = `
    <div class="verdict-banner pass"><span class="icon">✓</span>
      <div>垫片选配方案：净补偿量 ${signed(p.netCompensation)} μm，总成本 ${p.totalCost}
      <span class="sub">每位恰选一个选项；总成本已最低，并列时按安装位顺序取选项序号向量字典序最小者。调整后区间 [ ${p.adjustedLow} , ${p.adjustedHigh} ] μm 完全落入合格区间 [ ${r.targetLow} , ${r.targetHigh} ] μm。</span></div>
    </div>
    <dl class="kv">
      <dt>原最紧间隙区间</dt><dd>[ ${r.originalLow} , ${r.originalHigh} ] μm</dd>
      <dt>所需净补偿量区间</dt><dd>S ∈ [ ${r.requiredLow} , ${r.requiredHigh} ] μm（实际取 <b>${signed(p.netCompensation)}</b> μm）</dd>
      <dt>调整后间隙区间</dt><dd><b>[ ${p.adjustedLow} , ${p.adjustedHigh} ] μm</b></dd>
      <dt>选项序号向量</dt><dd><ol class="shim-vec">${vec}</ol></dd>
    </dl>
    <div class="table-wrap">
      <table class="data-table shim-detail-table">
        <thead><tr><th>安装位</th><th>方向</th><th>选中选项</th><th>厚度 μm</th><th>有符号厚度 μm</th><th>成本</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function readPositionsForSubmit() {
  const errors = [];
  if (!state.positions.length) errors.push("请至少录入 1 个安装位。");
  if (state.positions.length > 10) errors.push("安装位至多 10 个。");
  const positions = [];
  state.positions.forEach((pos, pi) => {
    if (pos.direction !== 1 && pos.direction !== -1) {
      errors.push(`安装位 ${pi + 1}：方向必须为 +1 或 -1。`);
    }
    if (!pos.options.length || pos.options.length > 6) {
      errors.push(`安装位 ${pi + 1}：选项数量须为 1～6 个。`);
      return;
    }
    const options = [];
    pos.options.forEach((opt, oi) => {
      const thickness = parseIntStrict(opt.thickness);
      const cost = parseIntStrict(opt.cost);
      if (thickness === null) errors.push(`安装位 ${pi + 1} 第 ${oi + 1} 个选项：厚度必须为整数。`);
      else if (thickness < 0 || thickness > 1e6) errors.push(`安装位 ${pi + 1} 第 ${oi + 1} 个选项：厚度须为 0～1000000 μm（当前 ${thickness}）。`);
      if (cost === null) errors.push(`安装位 ${pi + 1} 第 ${oi + 1} 个选项：成本必须为整数。`);
      else if (cost < 0 || cost > 1000) errors.push(`安装位 ${pi + 1} 第 ${oi + 1} 个选项：成本须为 0～1000（当前 ${cost}）。`);
      if (thickness !== null && cost !== null) options.push({ thickness, cost });
    });
    if (options.length === pos.options.length && pos.direction !== undefined) {
      positions.push({ direction: pos.direction, options });
    }
  });
  return { errors, positions };
}

async function runShim() {
  clearShimMessage();
  if (state.points.length < 2) return showShimError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showShimError("请至少录入 1 条测量约束。");
  const targetFrom = $("sTargetFrom").value, targetTo = $("sTargetTo").value;
  const targetLow = parseIntStrict($("sTargetLow").value);
  const targetHigh = parseIntStrict($("sTargetHigh").value);
  const errors = [];
  if (!targetFrom) errors.push("请选择目标起点。");
  if (!targetTo) errors.push("请选择目标终点。");
  if (targetFrom && targetTo && targetFrom === targetTo) errors.push("目标点对的两个点必须不同。");
  if (targetLow === null) errors.push("目标下限必须为整数。");
  if (targetHigh === null) errors.push("目标上限必须为整数。");
  if (targetLow !== null && Math.abs(targetLow) > 1e9) errors.push("目标下限超出 ±1000000000。");
  if (targetHigh !== null && Math.abs(targetHigh) > 1e9) errors.push("目标上限超出 ±1000000000。");
  if (targetLow !== null && targetHigh !== null && targetLow > targetHigh) {
    errors.push(`目标下限 ${targetLow} 不能大于上限 ${targetHigh}。`);
  }
  const parsed = readPositionsForSubmit();
  errors.push(...parsed.errors);
  if (errors.length) return showShimError(errors);

  state.shimPlan = {
    targetFrom, targetTo,
    targetLow: $("sTargetLow").value.trim(),
    targetHigh: $("sTargetHigh").value.trim()
  };
  persist();

  const btn = $("shimBtn");
  btn.disabled = true;
  btn.textContent = "选配计算中…";
  const { ok, data } = await postJSON("/api/shim-plan", {
    points: state.points,
    constraints: state.constraints,
    targetFrom, targetTo, targetLow, targetHigh,
    positions: parsed.positions
  });
  btn.disabled = false;
  btn.textContent = "计算垫片选配方案";
  if (!ok) {
    state.shim = null;
    renderShimResult();
    return showShimError(data && data.detail ? data.detail : "垫片选配请求失败。");
  }
  state.shim = data;
  if (data.consistent) state.analysis = { consistent: true, points: state.points };
  else state.analysis = data;   // 矛盾：同步展示现有负环
  renderResults();
  renderShimResult();
}

/* ---------------- 尺寸链改动影响 ---------------- */
const IMPACT_KIND = {
  tightened: { label: "收紧", cls: "tight" },
  loosened: { label: "放宽", cls: "loose" },
  mixed: { label: "混合", cls: "mixed" },
  becameBounded: { label: "变为有界", cls: "bnd" },
  becameUnbounded: { label: "变为无界", cls: "unb" }
};

function fmtImpactRange(lo, hi) {
  return `[ ${lo === null ? "−∞" : lo} , ${hi === null ? "+∞" : hi} ]`;
}

function renderBaselineInfo() {
  const box = $("baselineInfo");
  const b = state.baseline;
  if (!b) {
    box.innerHTML = `<p class="baseline-empty">尚未保存基线。点击「保存当前为基线」把当前基准点与测量清单存为对比基准，之后继续编辑测量再比较。</p>`;
    return;
  }
  const samePoints = state.points.length === b.points.length
    && state.points.every((p, i) => p === b.points[i]);
  box.innerHTML = `
    <span class="baseline-chip">已保存基线：${b.points.length} 个基准点（${esc(b.points.join("、"))}）・ ${b.constraints.length} 条测量</span>
    ${samePoints ? "" : '<p class="baseline-warn">⚠ 当前编辑稿的基准点名称/顺序与基线不一致，比较将被拒绝；请调整基准点或重新保存基线。</p>'}`;
}

function renderImpact() {
  renderBaselineInfo();
  const box = $("impactResult");
  const r = state.impact;
  if (!r) { box.innerHTML = ""; return; }

  if (!r.consistent) {
    // 任一版矛盾：只显示各矛盾版本的负环，不生成点对差异
    let html = `
      <div class="verdict-banner fail"><span class="icon">✕</span>
        <div>存在矛盾版本，不生成点对差异
        <span class="sub">基线或编辑稿中存在负权闭环；下列仅展示各矛盾版本的负环证据，请先消除矛盾再比较。</span></div>
      </div>`;
    if (r.baselineContradiction) {
      html += `<p class="tol-title">基线版本的负权闭环</p>${renderCycleBox(r.baselineContradiction)}`;
    }
    if (r.draftContradiction) {
      html += `<p class="tol-title">编辑稿版本的负权闭环</p>${renderCycleBox(r.draftContradiction)}`;
    }
    box.innerHTML = html;
    return;
  }

  const changes = r.changes;
  if (!changes.length) {
    box.innerHTML = `
      <div class="verdict-banner pass"><span class="icon">✓</span>
        <div>两版尺寸链推断完全一致
        <span class="sub">全部有序点对的最紧上下界与无界状态均未变化（测量可能有增删改，但不影响任何点对的推断）。</span></div>
      </div>`;
    return;
  }

  const counts = {};
  for (const ch of changes) counts[ch.kind] = (counts[ch.kind] || 0) + 1;
  const summary = Object.keys(IMPACT_KIND)
    .filter((k) => counts[k])
    .map((k) => `${IMPACT_KIND[k].label} ${counts[k]}`)
    .join("・");
  const rows = changes.map((ch) => {
    const kind = IMPACT_KIND[ch.kind];
    return `<tr>
      <td>${esc(ch.from)} → ${esc(ch.to)}</td>
      <td class="num">${fmtImpactRange(ch.lowerBefore, ch.upperBefore)}</td>
      <td class="cell-arrow">→</td>
      <td class="num">${fmtImpactRange(ch.lowerAfter, ch.upperAfter)}</td>
      <td><span class="tag ${kind.cls}">${kind.label}</span></td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <div class="verdict-banner info"><span class="icon">Δ</span>
      <div>共 ${changes.length} 个有序点对发生变化（${summary}）
      <span class="sub">按基准点录入顺序逐有序异点对比较最紧上下界与无界状态，仅列出发生变化的点对；无界以 ±∞ 表示。</span></div>
    </div>
    <div class="table-wrap impact-table">
      <table class="data-table">
        <thead><tr><th>点对</th><th>基线最紧区间 μm</th><th></th><th>编辑稿最紧区间 μm</th><th>变化</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function saveBaseline() {
  clearImpactMessage();
  if (state.points.length < 2) return showImpactError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showImpactError("请至少录入 1 条测量约束。");
  state.baseline = {
    points: state.points.slice(),
    constraints: state.constraints.map((c) => ({ ...c }))
  };
  state.impact = null;   // 基线变化后旧报告失效
  persist();
  renderImpact();
}

function clearBaseline() {
  clearImpactMessage();
  state.baseline = null;
  state.impact = null;   // 基线变化后旧报告失效
  persist();
  renderImpact();
}

async function runImpact() {
  clearImpactMessage();
  if (!state.baseline) return showImpactError("请先保存基线，再进行比较。");
  if (state.points.length < 2) return showImpactError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showImpactError("请至少录入 1 条测量约束。");
  const btn = $("impactBtn");
  btn.disabled = true;
  btn.textContent = "比较中…";
  const { ok, data } = await postJSON("/api/chain-impact", {
    baseline: state.baseline,
    draft: { points: state.points, constraints: state.constraints }
  });
  btn.disabled = false;
  btn.textContent = "比较改动影响";
  if (!ok) {
    state.impact = null;
    renderImpact();
    return showImpactError(data && data.detail ? data.detail : "改动影响比较请求失败。");
  }
  state.impact = data;
  if (data.consistent) {
    state.analysis = { consistent: true, points: state.points };
  } else if (data.draftContradiction) {
    // 编辑稿矛盾：同步到一致性结果区
    state.analysis = { consistent: false, points: data.points, contradiction: data.draftContradiction };
  }
  renderResults();
  renderImpact();
}

/* ---------------- 矛盾测量最小撤回 ---------------- */
function removableCount() {
  return state.constraints.filter((c) => state.removable[c.id]).length;
}

function renderRemovableTable() {
  const tbody = $("removalTbody");
  const has = state.constraints.length > 0;
  $("removalEmpty").style.display = has ? "none" : "block";
  $("removalTable").style.display = has ? "" : "none";
  $("removableCounter").textContent = `${removableCount()} / 16 可撤回`;
  if (!has) { tbody.innerHTML = ""; return; }
  tbody.innerHTML = state.constraints.map((c) => {
    const rem = !!state.removable[c.id];
    return `<tr>
      <td>${esc(c.id)}</td>
      <td>${esc(c.from)} → ${esc(c.to)}</td>
      <td class="num">[ ${c.low} , ${c.high} ]</td>
      <td><button class="btn tiny rem-toggle${rem ? " on" : ""}" data-rem-toggle="${esc(c.id)}"
        >${rem ? "可撤回" : "锁定"}</button></td>
    </tr>`;
  }).join("");
}

function renderMinRemovalResult() {
  const box = $("minRemovalResult");
  const r = state.minRemoval;
  if (!r) { box.innerHTML = ""; return; }
  if (r.consistent) {
    box.innerHTML = `
      <div class="verdict-banner pass"><span class="icon">✓</span>
        <div>原清单已一致：空撤回集
        <span class="sub">全部测量可以同时成立，无需撤回任何测量（删除 0 条）。</span></div>
      </div>`;
    return;
  }
  if (r.repairable === false) {
    box.innerHTML = `
      <div class="verdict-banner fail"><span class="icon">✕</span>
        <div>不可修复：锁定测量自身矛盾
        <span class="sub">未标记可撤回的测量之间已存在负权闭环，删除任何可撤回测量都无法消除它；请先调整标记或修正锁定测量。</span></div>
      </div>
      <p class="tol-title">锁定部分的负权闭环</p>
      ${renderCycleBox(r.contradiction)}
      <p class="tol-title">原清单的负权闭环</p>
      ${renderCycleBox(r.originalContradiction)}`;
    return;
  }
  const rem = r.removal;
  const removedSet = new Set(rem.removedIds);
  const chips = rem.removedIds.map((id, k) =>
    `<span class="chip removable">${esc(id)}<span class="tag-del">撤回 · 第 ${rem.removedIndices[k]} 条</span></span>`).join("");
  const remainRows = state.constraints
    .filter((c) => !removedSet.has(c.id))
    .map((c) => `<tr>
      <td>${esc(c.id)}</td>
      <td>${esc(c.from)} → ${esc(c.to)}</td>
      <td class="num">[ ${c.low} , ${c.high} ]</td>
      <td>${state.removable[c.id] ? '<span class="tag rem">可撤回</span>' : '<span class="tag lock">锁定</span>'}</td>
    </tr>`).join("");
  box.innerHTML = `
    <div class="verdict-banner info"><span class="icon">✂</span>
      <div>最少撤回 ${rem.removedCount} 条测量即可恢复一致
      <span class="sub">只允许删除可撤回测量；并列方案按原录入顺序取删除序号列表字典序最小者。确认后才会从编辑表删除并重新校验。</span></div>
    </div>
    <p class="tol-title">原清单的负权闭环</p>
    ${renderCycleBox(r.originalContradiction)}
    <p class="tol-title">撤回编号（共 ${rem.removedCount} 条，按录入顺序）</p>
    <div class="chip-row">${chips}</div>
    <p class="tol-title">撤回后的剩余清单（${rem.remainingIds.length} 条）</p>
    <div class="table-wrap simp-table">
      <table class="data-table">
        <thead><tr><th>编号</th><th>段</th><th>区间 μm</th><th>标记</th></tr></thead>
        <tbody>${remainRows}</tbody>
      </table>
    </div>
    <div class="row simp-actions">
      <button class="btn primary" id="applyMinRemovalBtn">确认撤回上述 ${rem.removedCount} 条测量</button>
    </div>`;
  $("applyMinRemovalBtn").addEventListener("click", applyMinRemoval);
}

function renderMinRemoval() {
  renderRemovableTable();
  renderMinRemovalResult();
}

async function runMinRemoval() {
  clearMinRemovalMessage();
  if (state.points.length < 2) return showMinRemovalError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showMinRemovalError("请至少录入 1 条测量约束。");
  const removableIds = state.constraints.filter((c) => state.removable[c.id]).map((c) => c.id);
  if (removableIds.length > 16) return showMinRemovalError("可撤回测量至多标记 16 条。");
  const btn = $("minRemovalBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/min-removal", {
    points: state.points,
    constraints: state.constraints,
    removableIds
  });
  btn.disabled = false;
  btn.textContent = "计算最小撤回预览";
  if (!ok) {
    state.minRemoval = null;
    renderMinRemovalResult();
    return showMinRemovalError(data && data.detail ? data.detail : "最小撤回请求失败。");
  }
  state.minRemoval = data;
  if (data.consistent) {
    state.analysis = { consistent: true, points: state.points };
  } else {
    // 矛盾：同步展示原负环到一致性结果区
    state.analysis = { consistent: false, points: data.points, contradiction: data.originalContradiction };
  }
  renderResults();
  renderMinRemovalResult();
}

function applyMinRemoval() {
  if (!state.minRemoval || !state.minRemoval.removal) return;
  const removed = new Set(state.minRemoval.removal.removedIds);
  if (!removed.size) return;
  state.constraints = state.constraints.filter((c) => !removed.has(c.id));
  if (state.editingId && removed.has(state.editingId)) resetConstraintForm();
  // 编辑表已变化：旧预览失效，按新清单重新校验
  markDirty();
  renderConstraints();
  clearMinRemovalMessage();
  runAnalyze();
}

/* ---------------- 测量复核排程 ---------------- */
function inspSelectedCount() {
  return state.constraints.filter((c) => state.inspSelected[c.id]).length;
}

function parseDepsRaw(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return s.split(/[,，、;；\s]+/).filter(Boolean);
}

function inspDepsBad(id, raw) {
  const selSet = new Set(
    state.constraints.filter((c) => state.inspSelected[c.id]).map((c) => c.id));
  const seen = new Set();
  for (const d of parseDepsRaw(raw)) {
    if (d === id || !selSet.has(d) || seen.has(d)) return true;
    seen.add(d);
  }
  return false;
}

function renderInspectionTable() {
  const tbody = $("inspTbody");
  const has = state.constraints.length > 0;
  $("inspEmpty").style.display = has ? "none" : "block";
  $("inspTable").style.display = has ? "" : "none";
  $("inspCounter").textContent = `${inspSelectedCount()} / 16 已选`;
  if (!has) { tbody.innerHTML = ""; return; }
  tbody.innerHTML = state.constraints.map((c, idx) => {
    const sel = !!state.inspSelected[c.id];
    const saved = state.inspParams[c.id] || {};
    const p = {
      duration: saved.duration !== undefined && saved.duration !== null ? String(saved.duration) : "",
      failPermille: saved.failPermille !== undefined && saved.failPermille !== null ? String(saved.failPermille) : "",
      deps: saved.deps !== undefined && saved.deps !== null ? String(saved.deps) : ""
    };
    const dur = parseIntStrict(p.duration);
    const durBad = sel && (dur === null || dur < 1 || dur > 1000);
    const fp = parseIntStrict(p.failPermille);
    const fpBad = sel && (fp === null || fp < 0 || fp > 999);
    const depsBad = sel && inspDepsBad(c.id, p.deps);
    return `<tr>
      <td><button class="btn tiny insp-toggle${sel ? " on" : ""}" data-insp-toggle="${esc(c.id)}"
        >${sel ? "已选" : "选取"}</button></td>
      <td>${esc(c.id)}<small class="insp-entry">#${idx + 1}</small></td>
      <td><input type="number" class="input insp-input${durBad ? " bad" : ""}"
           data-insp-field="duration" data-insp-for="${esc(c.id)}" min="1" max="1000" step="1"
           value="${esc(p.duration)}"${sel ? "" : " disabled"} placeholder="1～1000"></td>
      <td><input type="number" class="input insp-input${fpBad ? " bad" : ""}"
           data-insp-field="failPermille" data-insp-for="${esc(c.id)}" min="0" max="999" step="1"
           value="${esc(p.failPermille)}"${sel ? "" : " disabled"} placeholder="0～999"></td>
      <td><input type="text" class="input insp-deps${depsBad ? " bad" : ""}"
           data-insp-field="deps" data-insp-for="${esc(c.id)}"
           value="${esc(p.deps)}"${sel ? "" : " disabled"} placeholder="先复核编号，逗号分隔"></td>
    </tr>`;
  }).join("");
}

function fmtFraction(fr) {
  return fr.den === "1" ? fr.num : `${fr.num} / ${fr.den}`;
}

function renderInspectionResult() {
  const box = $("inspResult");
  const r = state.inspection;
  if (!r) { box.innerHTML = ""; return; }
  const plan = r.plan;
  const rows = plan.order.map((o) => `<tr>
      <td>${o.seq}</td>
      <td>${esc(o.id)}</td>
      <td class="num">${o.entryIndex}</td>
      <td class="num">${o.duration}</td>
      <td class="num">${o.failPermille}</td>
      <td class="num">${o.deps.length ? esc(o.deps.join("、")) : "—"}</td>
      <td class="num frac-cell"><b>${esc(fmtFraction(o.probability))}</b><br>
        <small>${esc(o.probability.decimal)}</small></td>
    </tr>`).join("");
  const exp = plan.expected;
  const expText = fmtFraction(exp) + (exp.den === "1" ? "" : ` = ${exp.decimal}`);
  const vec = plan.indexVector.map((x) => `<li>${x}</li>`).join("");
  box.innerHTML = `
    <div class="verdict-banner pass"><span class="icon">✓</span>
      <div>复核排程：预期总耗时 ${esc(expText)}
      <span class="sub">共 ${plan.order.length} 条，按此顺序逐条复核、遇首条不合格即停止；顺序满足全部先决依赖且预期总耗时最小，并列时按原录入位置的序号向量取字典序最小者。概率与耗时为精确分数（十进制为其有限展开）。</span></div>
    </div>
    <dl class="kv">
      <dt>预期总耗时（精确分数）</dt><dd>${esc(expText)}</dd>
      <dt>录入位置序号向量</dt><dd><ol class="shim-vec">${vec}</ol></dd>
    </dl>
    <div class="table-wrap insp-plan-table">
      <table class="data-table">
        <thead><tr><th>顺序</th><th>编号</th><th>录入位置</th><th>耗时</th><th>不合格‰</th><th>先复核</th><th>执行概率（此前全合格）</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderInspection() {
  renderInspectionTable();
  renderInspectionResult();
}

function readInspectionForSubmit() {
  const errors = [];
  const ids = state.constraints.filter((c) => state.inspSelected[c.id]).map((c) => c.id);
  if (!ids.length) errors.push("请至少选取 1 条复核测量。");
  if (ids.length > 16) errors.push("复核测量至多选取 16 条。");
  const idSet = new Set(ids);
  const items = [];
  for (const id of ids) {
    const p = state.inspParams[id] || {};
    const duration = parseIntStrict(p.duration);
    const failPermille = parseIntStrict(p.failPermille);
    if (duration === null) errors.push(`测量 ${id}：复核耗时必须为整数。`);
    else if (duration < 1 || duration > 1000) errors.push(`测量 ${id}：复核耗时须为 1～1000（当前 ${duration}）。`);
    if (failPermille === null) errors.push(`测量 ${id}：不合格概率必须为整数（‰）。`);
    else if (failPermille < 0 || failPermille > 999) errors.push(`测量 ${id}：不合格概率须为 0～999‰（当前 ${failPermille}）。`);
    const deps = parseDepsRaw(p.deps);
    const seen = new Set();
    for (const d of deps) {
      if (d === id) errors.push(`测量 ${id}：不能依赖自身。`);
      else if (!idSet.has(d)) errors.push(`测量 ${id}：依赖 ${d} 未选取（依赖只能引用所选测量）。`);
      else if (seen.has(d)) errors.push(`测量 ${id}：依赖 ${d} 重复。`);
      seen.add(d);
    }
    if (duration !== null && failPermille !== null) {
      items.push({ id, duration, failPermille, deps });
    }
  }
  return { errors, items };
}

async function runInspection() {
  clearInspMessage();
  if (state.points.length < 2) return showInspError("请先录入至少 2 个基准点。");
  if (state.constraints.length < 1) return showInspError("请至少录入 1 条测量约束。");
  const parsed = readInspectionForSubmit();
  if (parsed.errors.length) return showInspError(parsed.errors);
  const btn = $("inspBtn");
  btn.disabled = true;
  btn.textContent = "计算中…";
  const { ok, data } = await postJSON("/api/inspection-order", {
    points: state.points,
    constraints: state.constraints,
    items: parsed.items
  });
  btn.disabled = false;
  btn.textContent = "计算复核排程";
  if (!ok) {
    state.inspection = null;
    renderInspectionResult();
    return showInspError(data && data.detail ? data.detail : "复核排程请求失败。");
  }
  state.inspection = data;
  renderInspectionResult();
}

/* ---------------- 示例 ---------------- */
async function loadExample(key) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  clearFormMessage();
  clearQueryMessage();
  clearWindowMessage();
  clearShimMessage();
  state.points = ex.points.slice();
  state.constraints = ex.constraints.map((c) => ({ ...c }));
  state.steps = ex.steps ? { ...ex.steps } : {};
  state.nominals = ex.nominals ? { ...ex.nominals } : {};
  state.positions = ex.positions
    ? ex.positions.map((p) => ({ direction: p.direction,
        options: p.options.map((o) => ({ ...o })) }))
    : [];
  state.editingId = null;
  state.simplify = null;
  state.tolerance = null;
  state.fit = null;
  state.window = null;
  state.shim = null;
  state.impact = null;   // 编辑稿变化后旧改动影响报告失效
  state.minRemoval = null;
  state.inspection = null;
  state.removable = {};
  if (ex.removable) for (const id of ex.removable) state.removable[id] = true;
  state.inspSelected = {};
  state.inspParams = {};
  if (ex.inspection) {
    for (const id of Object.keys(ex.inspection)) {
      state.inspSelected[id] = true;
      const p = ex.inspection[id];
      state.inspParams[id] = { duration: p.duration, failPermille: p.failPermille, deps: p.deps };
    }
  }
  if (ex.impactBaseline) {
    state.baseline = {
      points: ex.impactBaseline.points.slice(),
      constraints: ex.impactBaseline.constraints.map((c) => ({ ...c }))
    };
  }
  renderSimplify();
  renderTolerance();
  renderFit();
  renderWindowResult();
  renderPositions();
  renderShimResult();
  renderMinRemoval();
  renderInspection();
  clearSimplifyMessage();
  clearToleranceMessage();
  clearFitMessage();
  clearImpactMessage();
  clearMinRemovalMessage();
  clearInspMessage();
  resetConstraintForm();
  if (ex.query) {
    state.query = { ...ex.query };
    $("qTargetLow").value = ex.query.targetLow;
    $("qTargetHigh").value = ex.query.targetHigh;
  }
  if (ex.readingWindow) {
    state.readingWindow = { ...ex.readingWindow };
    $("wTargetLow").value = ex.readingWindow.targetLow;
    $("wTargetHigh").value = ex.readingWindow.targetHigh;
  }
  if (ex.shimPlan) {
    state.shimPlan = { ...ex.shimPlan };
    $("sTargetLow").value = ex.shimPlan.targetLow;
    $("sTargetHigh").value = ex.shimPlan.targetHigh;
  }
  persist();
  renderAll();
  await runAnalyze();
  if (ex.query && state.analysis && state.analysis.consistent) {
    $("qFrom").value = ex.query.from;
    $("qTo").value = ex.query.to;
    await runQuery();
  }
  if (ex.autoSimplify && state.analysis && state.analysis.consistent) {
    await runSimplify();
  }
  if (ex.autoTolerance) {
    await runTolerance();
  }
  if (ex.autoFit) {
    await runFit();
  }
  if (ex.autoWindow && state.analysis && state.analysis.consistent) {
    $("wFrom").value = ex.readingWindow.from;
    $("wTo").value = ex.readingWindow.to;
    $("wTargetFrom").value = ex.readingWindow.targetFrom;
    $("wTargetTo").value = ex.readingWindow.targetTo;
    await runWindow();
  }
  if (ex.autoShim && state.analysis && state.analysis.consistent) {
    $("sTargetFrom").value = ex.shimPlan.targetFrom;
    $("sTargetTo").value = ex.shimPlan.targetTo;
    await runShim();
  }
  if (ex.autoImpact && state.baseline) {
    await runImpact();
  }
  if (ex.autoMinRemoval) {
    await runMinRemoval();
  }
  if (ex.autoInspection) {
    await runInspection();
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* */ }
  if (saved && Array.isArray(saved.points) && Array.isArray(saved.constraints)) {
    state.points = saved.points;
    state.constraints = saved.constraints;
    if (saved.steps && typeof saved.steps === "object") state.steps = saved.steps;
    if (saved.nominals && typeof saved.nominals === "object") state.nominals = saved.nominals;
    if (saved.query) state.query = saved.query;
    if (saved.readingWindow) state.readingWindow = saved.readingWindow;
    if (saved.shimPlan) state.shimPlan = saved.shimPlan;
    if (saved.baseline && typeof saved.baseline === "object"
        && Array.isArray(saved.baseline.points) && Array.isArray(saved.baseline.constraints)) {
      state.baseline = saved.baseline;
    }
    if (saved.removable && typeof saved.removable === "object") {
      state.removable = saved.removable;
    }
    if (saved.inspSelected && typeof saved.inspSelected === "object") {
      state.inspSelected = saved.inspSelected;
    }
    if (saved.inspParams && typeof saved.inspParams === "object") {
      state.inspParams = saved.inspParams;
    }
    if (Array.isArray(saved.positions)) {
      state.positions = saved.positions
        .filter((p) => p && (p.direction === 1 || p.direction === -1) && Array.isArray(p.options))
        .slice(0, 10)
        .map((p) => ({
          direction: p.direction,
          options: p.options.slice(0, 6).map((o) => ({
            thickness: o && o.thickness !== undefined && o.thickness !== null ? String(o.thickness) : "",
            cost: o && o.cost !== undefined && o.cost !== null ? String(o.cost) : ""
          }))
        }));
    }
  }
  syncSelects();
  if (state.query.targetLow !== undefined) {
    $("qTargetLow").value = state.query.targetLow;
    $("qTargetHigh").value = state.query.targetHigh;
  }
  if (state.readingWindow.targetLow !== undefined) {
    $("wTargetLow").value = state.readingWindow.targetLow;
    $("wTargetHigh").value = state.readingWindow.targetHigh;
  }
  if (state.shimPlan.targetLow !== undefined) {
    $("sTargetLow").value = state.shimPlan.targetLow;
    $("sTargetHigh").value = state.shimPlan.targetHigh;
  }
  renderAll();

  $("addPointBtn").addEventListener("click", addPoint);
  $("pointName").addEventListener("keydown", (e) => { if (e.key === "Enter") addPoint(); });
  $("pointList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-point]");
    if (btn) deletePoint(btn.dataset.point);
  });

  $("saveConstraintBtn").addEventListener("click", saveConstraint);
  $("cancelEditBtn").addEventListener("click", () => { resetConstraintForm(); clearFormMessage(); });
  $("constraintTbody").addEventListener("click", (e) => {
    const eb = e.target.closest("button[data-edit]");
    const db = e.target.closest("button[data-del]");
    if (eb) editConstraint(eb.dataset.edit);
    if (db) deleteConstraint(db.dataset.del);
  });

  $("analyzeBtn").addEventListener("click", runAnalyze);
  $("queryBtn").addEventListener("click", runQuery);
  $("simplifyBtn").addEventListener("click", runSimplify);
  $("toleranceBtn").addEventListener("click", runTolerance);
  $("fitBtn").addEventListener("click", runFit);
  $("windowBtn").addEventListener("click", runWindow);
  $("shimBtn").addEventListener("click", runShim);
  $("saveBaselineBtn").addEventListener("click", saveBaseline);
  $("clearBaselineBtn").addEventListener("click", clearBaseline);
  $("impactBtn").addEventListener("click", runImpact);
  $("minRemovalBtn").addEventListener("click", runMinRemoval);
  $("inspBtn").addEventListener("click", runInspection);
  $("inspTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-insp-toggle]");
    if (!btn) return;
    const id = btn.dataset.inspToggle;
    if (state.inspSelected[id]) {
      delete state.inspSelected[id];
    } else {
      if (inspSelectedCount() >= 16) {
        showInspError("复核测量至多选取 16 条；请先取消其他测量的选取。");
        return;
      }
      state.inspSelected[id] = true;
      if (!state.inspParams[id]) {
        state.inspParams[id] = { duration: "10", failPermille: "0", deps: "" };
      }
    }
    // 选取变化后旧排程结果失效
    state.inspection = null;
    clearInspMessage();
    persist();
    renderInspection();
  });
  $("inspTbody").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-insp-field]");
    if (!inp) return;
    const id = inp.dataset.inspFor;
    const field = inp.dataset.inspField;   // duration | failPermille | deps
    if (!state.inspParams[id]) {
      state.inspParams[id] = { duration: "10", failPermille: "0", deps: "" };
    }
    const raw = inp.value;
    state.inspParams[id][field] = raw;
    let bad = false;
    if (field === "duration") {
      const v = parseIntStrict(raw);
      bad = v === null || v < 1 || v > 1000;
    } else if (field === "failPermille") {
      const v = parseIntStrict(raw);
      bad = v === null || v < 0 || v > 999;
    } else {
      bad = inspDepsBad(id, raw);
    }
    inp.classList.toggle("bad", bad);
    // 排程参数变化后旧排程结果失效
    state.inspection = null;
    clearInspMessage();
    persist();
    renderInspectionResult();
  });
  $("removalTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-rem-toggle]");
    if (!btn) return;
    const id = btn.dataset.remToggle;
    if (state.removable[id]) {
      delete state.removable[id];
    } else {
      if (removableCount() >= 16) {
        showMinRemovalError("可撤回测量至多标记 16 条；请先取消其他测量的可撤回标记。");
        return;
      }
      state.removable[id] = true;
    }
    // 标记变化后旧预览失效
    state.minRemoval = null;
    clearMinRemovalMessage();
    persist();
    renderMinRemoval();
  });
  $("addPositionBtn").addEventListener("click", () => {
    if (state.positions.length >= 10) return;
    state.positions.push(defaultPosition());
    invalidateShim();
    renderPositions();
  });
  $("positionsWrap").addEventListener("click", (e) => {
    const delPos = e.target.closest("button[data-pos-del]");
    const addOpt = e.target.closest("button[data-opt-add]");
    const delOpt = e.target.closest("button[data-opt-del]");
    if (delPos) {
      const pi = Number(delPos.dataset.posDel);
      state.positions.splice(pi, 1);
      invalidateShim();
      renderPositions();
    } else if (addOpt) {
      const pi = Number(addOpt.dataset.pos);
      if (state.positions[pi].options.length >= 6) return;
      state.positions[pi].options.push({ thickness: "", cost: "" });
      invalidateShim();
      renderPositions();
    } else if (delOpt) {
      const pi = Number(delOpt.dataset.pos);
      const oi = Number(delOpt.dataset.opt);
      const pos = state.positions[pi];
      if (pos.options.length <= 1) return;
      pos.options.splice(oi, 1);
      invalidateShim();
      renderPositions();
    }
  });
  $("positionsWrap").addEventListener("change", (e) => {
    const dirSel = e.target.closest("select[data-pos-dir]");
    if (!dirSel) return;
    const pi = Number(dirSel.dataset.posDir);
    state.positions[pi].direction = Number(dirSel.value);
    invalidateShim();
    renderPositions();
  });
  $("positionsWrap").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-opt-field]");
    if (!inp) return;
    const pi = Number(inp.dataset.pos);
    const oi = Number(inp.dataset.opt);
    const field = inp.dataset.optField;   // thickness | cost
    const raw = inp.value.trim();
    state.positions[pi].options[oi][field] = raw;
    const v = parseIntStrict(raw);
    const bad = field === "thickness"
      ? (raw !== "" && (v === null || v < 0 || v > 1e6))
      : (raw !== "" && (v === null || v < 0 || v > 1000));
    inp.classList.toggle("bad", bad);
    if (field === "thickness") {
      // 同步该行有符号厚度列
      const cell = inp.closest("tr").querySelector(".option-signed");
      if (cell) cell.textContent = (v === null || raw === "") ? "—" : signed(state.positions[pi].direction * v);
    }
    invalidateShim();
  });
  // 目标点对或合格区间变化后清除旧垫片结果
  ["sTargetFrom", "sTargetTo"].forEach((id) =>
    $(id).addEventListener("change", invalidateShim));
  ["sTargetLow", "sTargetHigh"].forEach((id) =>
    $(id).addEventListener("input", invalidateShim));

  // 补测点对或目标条件变化后清除旧窗口结果
  ["wFrom", "wTo", "wTargetFrom", "wTargetTo"].forEach((id) =>
    $(id).addEventListener("change", () => {
      state.window = null;
      clearWindowMessage();
      renderWindowResult();
    }));
  ["wTargetLow", "wTargetHigh"].forEach((id) =>
    $(id).addEventListener("input", () => {
      state.window = null;
      clearWindowMessage();
      renderWindowResult();
    }));
  $("nominalTbody").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-nominal-for]");
    if (!inp) return;
    const p = inp.dataset.nominalFor;
    const raw = inp.value.trim();
    if (raw === "" || raw === "0") delete state.nominals[p];   // 缺省按 0 处理
    else state.nominals[p] = raw;
    const v = parseIntStrict(raw === "" ? "0" : raw);
    inp.classList.toggle("bad", v === null || Math.abs(v) > 1e9);
    // 名义值变化后清除旧拟合结果
    state.fit = null;
    clearFitMessage();
    persist();
    renderFitResult();
  });
  $("stepTbody").addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-step-for]");
    if (!inp) return;
    const id = inp.dataset.stepFor;
    const raw = inp.value.trim();
    if (raw === "" || raw === "1") delete state.steps[id];   // 缺省按 1 处理
    else state.steps[id] = raw;
    const v = parseIntStrict(raw === "" ? "1" : raw);
    inp.classList.toggle("bad", v === null || v < 0 || v > 1000);
    const lockCell = inp.closest("tr").querySelector(".step-lock");
    if (lockCell) lockCell.innerHTML = v === 0 ? '<span class="tag lock">锁定</span>' : "";
    // 步长变化后清除旧预算结果
    state.tolerance = null;
    clearToleranceMessage();
    persist();
    renderToleranceResult();
  });
  $("exampleSelect").addEventListener("change", (e) => {
    const key = e.target.value;
    e.target.value = "";
    if (key) loadExample(key);
  });

  const saveQueryForm = () => {
    state.query.from = $("qFrom").value;
    state.query.to = $("qTo").value;
    state.query.targetLow = $("qTargetLow").value.trim();
    state.query.targetHigh = $("qTargetHigh").value.trim();
    persist();
  };
  ["qFrom", "qTo", "qTargetLow", "qTargetHigh"].forEach((id) =>
    $(id).addEventListener("change", saveQueryForm));

  const saveWindowForm = () => {
    state.readingWindow.from = $("wFrom").value;
    state.readingWindow.to = $("wTo").value;
    state.readingWindow.targetFrom = $("wTargetFrom").value;
    state.readingWindow.targetTo = $("wTargetTo").value;
    state.readingWindow.targetLow = $("wTargetLow").value.trim();
    state.readingWindow.targetHigh = $("wTargetHigh").value.trim();
    persist();
  };
  ["wFrom", "wTo", "wTargetFrom", "wTargetTo"].forEach((id) =>
    $(id).addEventListener("change", saveWindowForm));
  ["wTargetLow", "wTargetHigh"].forEach((id) =>
    $(id).addEventListener("change", saveWindowForm));

  const saveShimForm = () => {
    state.shimPlan.targetFrom = $("sTargetFrom").value;
    state.shimPlan.targetTo = $("sTargetTo").value;
    state.shimPlan.targetLow = $("sTargetLow").value.trim();
    state.shimPlan.targetHigh = $("sTargetHigh").value.trim();
    persist();
  };
  ["sTargetFrom", "sTargetTo", "sTargetLow", "sTargetHigh"].forEach((id) =>
    $(id).addEventListener("change", saveShimForm));
}

document.addEventListener("DOMContentLoaded", init);
