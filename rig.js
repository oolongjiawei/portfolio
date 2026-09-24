// ─────────────────────────────────────────────────────────────
//  2.5D character rig
//  - hierarchical skeleton: COG → spine → chest → neck → head
//  - 2-bone IK arms & legs with pole vectors and stretch
//  - body parts projected from a turntable angle (rotY) and
//    depth-sorted, the way a Harmony / Moho turnaround rig works
// ─────────────────────────────────────────────────────────────
(function characterRig() {
  const svg = document.getElementById("rig");
  if (!svg) return;

  const NS = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const set = (e, attrs) => { for (const k in attrs) e.setAttribute(k, attrs[k]); };
  const show = (e, on) => e.setAttribute("visibility", on ? "visible" : "hidden");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const f = (n) => n.toFixed(1);

  const C = {
    line: "#1d1b1f", skin: "#f3c9a4", skinShade: "#e0a57e", hair: "#3a2c27",
    hoodie: "#e8491d", hoodieShade: "#b9370f", pants: "#2d3142",
    shoe: "#f7f4ee", glove: "#ffffff", cheek: "#ff8a7a", mouth: "#7a2630", badge: "#2457e6",
  };
  const OUT = 2.5;            // outline width
  const GROUND = 392;
  const ROOT_X = 200;
  const R = 46;               // head radius
  const ARM = [48, 46];       // upper arm, forearm
  const LEG = [56, 55];       // thigh, shin
  const SIDES = [-1, 1];      // -1 = character's right (R), 1 = character's left (L)
  const tag = (s) => (s > 0 ? "L" : "R");

  // ── Poses: hand IK targets are 3D offsets from the shoulder (x3, y, z3) ──
  const POSES = {
    idle:  { hand: { [-1]: [-12, 86, 6], [1]: [12, 86, 6] },  brow: 0,  mouth: "smile", wave: 0, bounce: 0, tilt: 0 },
    wave:  { hand: { [-1]: [-12, 86, 6], [1]: [42, -58, 12] }, brow: -3, mouth: "open",  wave: 1, bounce: 0, tilt: 5 },
    cheer: { hand: { [-1]: [-22, -86, 6], [1]: [22, -86, 6] }, brow: -4, mouth: "open",  wave: 0, bounce: 1, tilt: 0 },
    hips:  { hand: { [-1]: [-4, 70, 0], [1]: [4, 70, 0] },     brow: 1,  mouth: "smile", wave: 0, bounce: 0, tilt: -4 },
  };

  // ── State ──
  const S = {
    phi: 0, phiGoal: null,
    auto: false, autoStart: 0,
    skel: false, ctrls: true,
    pose: "wave",
    hand: {}, handGoal: {},
    foot: {}, footGoal: {},
    cog: { x: 0, y: 0 }, cogGoal: { x: 0, y: 0 },
    brow: 0, wave: 0, bounce: 0, tilt: 0, mouth: "smile",
    look: { x: 0, y: 0, t: -1e9 },
    yaw: 0, pitch: 0,
    blinkAt: 2500,
    drag: null, touched: false,
    sh: {},              // last shoulder screen positions (for hand dragging)
  };
  for (const s of SIDES) {
    const [x, y, z] = POSES.wave.hand[s];
    S.hand[s] = { x, y, z }; S.handGoal[s] = { x, y, z };
    S.foot[s] = { x: s * 17, z: 0, lift: 0 }; S.footGoal[s] = { ...S.foot[s] };
  }

  // ── Build the SVG ──
  const shadow = $("ellipse", { cx: ROOT_X, cy: GROUND + 2, rx: 70, ry: 9, class: "rig__shadow" }, svg);
  const turnCtrl = $("g", { class: "ctrl ctrl--C", "data-ctrl": "turn" }, svg);
  $("ellipse", { cx: ROOT_X, cy: GROUND + 2, rx: 96, ry: 17 }, turnCtrl);
  $("path", { d: `M${ROOT_X + 88} ${GROUND - 6} l8 8 l-11 3`, class: "ctrl__arrow" }, turnCtrl);
  $("path", { d: `M${ROOT_X - 88} ${GROUND + 10} l-8 -8 l11 -3`, class: "ctrl__arrow" }, turnCtrl);

  const char = $("g", { class: "rig__char" }, svg);
  const skel = $("g", { class: "rig__skel" }, svg);
  const ctrls = $("g", { class: "rig__ctrls" }, svg);
  const hud = $("g", { class: "rig__hud" }, svg);
  const hudL = $("text", { x: 14, y: 22 }, hud);
  const hudR = $("text", { x: 386, y: 22, "text-anchor": "end", class: "rig__view" }, hud);

  const hose = (parent, color, w) => ({
    o: $("path", { fill: "none", stroke: C.line, "stroke-width": w + OUT * 2, "stroke-linecap": "round" }, parent),
    f: $("path", { fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round" }, parent),
  });

  // Legs
  const legs = {};
  for (const s of SIDES) {
    const g = $("g", {});
    legs[s] = { g, hose: hose(g, C.pants, 21), shoe: $("ellipse", { fill: C.shoe, stroke: C.line, "stroke-width": OUT }, g),
      lace: $("path", { fill: "none", stroke: C.hoodie, "stroke-width": 2.5, "stroke-linecap": "round" }, g) };
  }
  // Arms
  const arms = {};
  for (const s of SIDES) {
    const g = $("g", {});
    const glove = $("g", {});
    const thumb = $("circle", { r: 5.5, cx: 7, cy: -9, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    $("circle", { r: 11.5, cx: 8, cy: 0, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    $("rect", { x: -5, y: -9, width: 8, height: 18, rx: 3, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    arms[s] = { g, hose: hose(g, C.hoodie, 17), glove, thumb };
    g.appendChild(glove);
  }
  // Hood
  const hood = $("ellipse", { fill: C.hoodieShade, stroke: C.line, "stroke-width": OUT });
  // Torso
  const torsoG = $("g", {});
  const brief = $("path", { fill: C.pants }, torsoG);
  const torso = $("path", { fill: C.hoodie, stroke: C.line, "stroke-width": OUT, "stroke-linejoin": "round" }, torsoG);
  const pocket = $("path", { fill: C.hoodieShade, stroke: C.line, "stroke-width": 2, "stroke-linejoin": "round" }, torsoG);
  const strings = SIDES.map(() => ({
    l: $("path", { stroke: "#fff", "stroke-width": 2.5, "stroke-linecap": "round" }, torsoG),
    tip: $("circle", { r: 2.5, fill: "#fff", stroke: C.line, "stroke-width": 1.2 }, torsoG),
  }));
  const badge = $("ellipse", { fill: C.badge, stroke: C.line, "stroke-width": 1.5 }, torsoG);
  // Neck
  const neckG = $("g", {});
  const neck = hose(neckG, C.skin, 15);
  // Head (drawn in head-local space, then translated/rotated)
  const headG = $("g", {});
  const curl = $("path", { d: "M0 0 C4 -16 20 -16 16 -6 C13 1 5 -2 8 -9", fill: "none", stroke: C.hair, "stroke-width": 4.5, "stroke-linecap": "round" }, headG);
  const bun = $("circle", { r: 17, fill: C.hair, stroke: C.line, "stroke-width": OUT }, headG);
  const skull = $("circle", { r: R, fill: C.hair, stroke: C.line, "stroke-width": OUT }, headG);
  const face = $("ellipse", { fill: C.skin, "clip-path": "url(#rig-headclip)" }, headG);
  const ears = SIDES.map(() => $("ellipse", { fill: C.skin, stroke: C.line, "stroke-width": 2 }, headG));
  const cheeks = SIDES.map(() => $("ellipse", { fill: C.cheek, opacity: 0.45 }, headG));
  const eyes = SIDES.map(() => {
    const g = $("g", {}, headG);
    return { g, ball: $("ellipse", { fill: C.line }, g), glint: $("circle", { r: 1.8, fill: "#fff" }, g) };
  });
  const brows = SIDES.map(() => $("path", { fill: "none", stroke: C.hair, "stroke-width": 3, "stroke-linecap": "round" }, headG));
  const nose = $("ellipse", { rx: 4.5, ry: 3.8, fill: C.skinShade, stroke: C.line, "stroke-width": 1.8 }, headG);
  const mouth = $("path", { stroke: C.line, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, headG);

  // Skeleton overlay
  const BONES = [
    ["cog", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"], ["head", "headEnd"],
    ...SIDES.flatMap((s) => [["chest", `sh${s}`], [`sh${s}`, `el${s}`], [`el${s}`, `wr${s}`], [`wr${s}`, `hn${s}`],
      ["cog", `hip${s}`], [`hip${s}`, `kn${s}`], [`kn${s}`, `an${s}`], [`an${s}`, `toe${s}`]]),
  ];
  const JOINTS = [...new Set(BONES.flat())];
  const LABELS = { cog: "COG", chest: "spine_03", head: "head", "el1": "elbow_L", "el-1": "elbow_R", "kn1": "knee_L", "kn-1": "knee_R" };
  const boneEls = BONES.map(() => $("path", { class: "rig__bone" }, skel));
  const jointEls = JOINTS.map((j) => $("circle", { r: j === "cog" ? 5 : 3.5, class: "rig__joint" }, skel));
  const labelEls = Object.entries(LABELS).map(([j, t]) => { const e = $("text", { class: "rig__label" }, skel); e.textContent = t; return [j, e]; });

  // Controls (Maya colour convention: left = blue, right = red, centre = yellow)
  const cogCtrl = $("g", { class: "ctrl ctrl--C", "data-ctrl": "cog" }, ctrls);
  const cogRing = $("ellipse", { rx: 52, ry: 13 }, cogCtrl);
  const handCtrl = {}, footCtrl = {};
  for (const s of SIDES) {
    footCtrl[s] = $("rect", { class: `ctrl ctrl--${tag(s)}`, "data-ctrl": "foot", "data-side": s, rx: 6, width: 40, height: 22 }, ctrls);
  }
  for (const s of SIDES) {
    const g = $("g", { class: `ctrl ctrl--${tag(s)}`, "data-ctrl": "hand", "data-side": s }, ctrls);
    $("circle", { r: 17 }, g);
    $("path", { d: "M-23 0H-17M17 0H23M0 -23V-17M0 17V23" }, g);
    handCtrl[s] = g;
  }

  // ── Math helpers ──
  function ik(a, t, l1, l2, pole, maxStretch) {
    const dx = t.x - a.x, dy = t.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const k = clamp(d / (l1 + l2), 1, maxStretch);   // stretchy IK
    const L1 = l1 * k, L2 = l2 * k;
    const dc = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 0.01);
    const ux = dx / d, uy = dy / d;
    const end = { x: a.x + ux * dc, y: a.y + uy * dc };
    const ang = Math.acos(clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1));
    const base = Math.atan2(uy, ux);
    const e1 = { x: a.x + Math.cos(base + ang) * L1, y: a.y + Math.sin(base + ang) * L1 };
    const e2 = { x: a.x + Math.cos(base - ang) * L1, y: a.y + Math.sin(base - ang) * L1 };
    // Pole vector picks which way the elbow / knee bends
    const dot = (e) => (e.x - a.x) * pole.x + (e.y - a.y) * pole.y;
    return { mid: dot(e1) >= dot(e2) ? e1 : e2, end };
  }
  const hosePath = (a, m, b) => {
    const cx = 2 * m.x - (a.x + b.x) / 2, cy = 2 * m.y - (a.y + b.y) / 2;   // curve passes through m
    return `M${f(a.x)} ${f(a.y)}Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`;
  };
  const bonePath = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, w = Math.min(6, len * 0.16);
    const mx = a.x + dx * 0.2, my = a.y + dy * 0.2;
    return `M${f(a.x)} ${f(a.y)}L${f(mx + nx * w)} ${f(my + ny * w)}L${f(b.x)} ${f(b.y)}L${f(mx - nx * w)} ${f(my - ny * w)}Z`;
  };

  // ── Interaction ──
  function toSvg(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function interrupt() {
    S.touched = true;
    if (S.auto) { S.auto = false; syncBar(); }
  }
  svg.addEventListener("pointerdown", (e) => {
    const c = e.target.closest("[data-ctrl]");
    const p = toSvg(e);
    interrupt();
    S.drag = {
      kind: c && S.ctrls ? c.dataset.ctrl : "turn",
      side: c ? +c.dataset.side : 0,
      x0: p.x, y0: p.y, phi0: S.phi, cog0: { ...S.cogGoal },
    };
    S.phiGoal = null;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch {}
    svg.classList.add("is-dragging");
  });
  const endDrag = () => { S.drag = null; svg.classList.remove("is-dragging"); };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("pointermove", (e) => {
    const p = toSvg(e);
    S.look = { x: p.x, y: p.y, t: performance.now() };
    const d = S.drag;
    if (!d) return;
    const cp = Math.cos(S.phi), sp = Math.sin(S.phi);
    if (d.kind === "turn") {
      S.phi = d.phi0 + (p.x - d.x0) * 0.014;
    } else if (d.kind === "cog") {
      S.cogGoal = { x: clamp(d.cog0.x + p.x - d.x0, -40, 40), y: clamp(d.cog0.y + p.y - d.y0, -8, 50) };
      S.cog = { ...S.cogGoal };
    } else if (d.kind === "hand") {
      const sh = S.sh[d.side], h = S.handGoal[d.side];
      const ox = p.x - sh.x, oy = p.y - sh.y;
      // Screen → rig space: solve for whichever axis faces the camera most
      if (Math.abs(cp) >= Math.abs(sp)) h.x = (ox - h.z * sp) / cp;
      else h.z = (ox - h.x * cp) / sp;
      h.y = oy;
      S.hand[d.side] = { ...h };
      setPose("custom");
    } else if (d.kind === "foot") {
      const ft = S.footGoal[d.side];
      const ox = p.x - ROOT_X;
      if (Math.abs(cp) >= Math.abs(sp)) ft.x = clamp((ox - ft.z * sp) / cp, -70, 70);
      else ft.z = clamp((ox - ft.x * cp) / sp, -70, 70);
      ft.lift = clamp(GROUND - 12 - p.y, 0, 70);
      S.foot[d.side] = { ...ft };
      setPose("custom");
    }
  }, { passive: true });

  // ── Toolbar ──
  const bar = document.querySelector(".rigbar");
  const slider = document.getElementById("rig-rot");
  function setPose(name) {
    S.pose = name;
    const P = POSES[name];
    if (P) {
      for (const s of SIDES) {
        const [x, y, z] = P.hand[s];
        S.handGoal[s] = { x, y, z };
        S.footGoal[s] = { x: s * 17, z: 0, lift: 0 };
      }
      S.cogGoal = { x: 0, y: 0 };
    }
    syncBar();
  }
  function syncBar() {
    if (!bar) return;
    bar.querySelectorAll("[data-pose]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pose === S.pose));
    bar.querySelector("#rig-auto").setAttribute("aria-pressed", S.auto);
    bar.querySelector("#rig-auto").textContent = S.auto ? "❚❚ Turnaround" : "▶ Turnaround";
    bar.querySelector("#rig-skel").setAttribute("aria-pressed", S.skel);
    bar.querySelector("#rig-ctrl").setAttribute("aria-pressed", S.ctrls);
    svg.classList.toggle("is-xray", S.skel);
    svg.classList.toggle("no-ctrls", !S.ctrls);
  }
  function startAuto() {
    S.auto = true;
    S.autoStart = performance.now();
    if (S.pose !== "idle") setPose("idle");
    syncBar();
  }
  bar?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "rig-auto") { S.touched = true; S.auto ? (S.auto = false) : startAuto(); }
    else {
      interrupt();
      if (b.dataset.view != null) S.phiGoal = rad(+b.dataset.view);
      else if (b.dataset.pose) setPose(b.dataset.pose);
      else if (b.id === "rig-skel") S.skel = !S.skel;
      else if (b.id === "rig-ctrl") S.ctrls = !S.ctrls;
    }
    syncBar();
  });
  slider?.addEventListener("input", () => { interrupt(); S.phiGoal = null; S.phi = rad(+slider.value); });

  // ── Frame ──
  let lastView = "", lastOrder = "";
  function frame(t) {
    const ease = reduced ? 1 : 0.12;

    // Turntable
    if (S.auto) {
      const step = Math.floor((t - S.autoStart) / 1300) + 1;
      S.phiGoal = rad(step * 45);
    }
    if (S.phiGoal != null) {
      const diff = wrap(S.phiGoal - S.phi);
      S.phi += Math.abs(diff) < 0.001 ? diff : diff * (reduced ? 1 : 0.1);
    }
    const phi = S.phi, cp = Math.cos(phi), sp = Math.sin(phi);
    const proj = (x3, z3) => x3 * cp + z3 * sp;          // screen x offset
    const depth = (x3, z3) => -x3 * sp + z3 * cp;        // + = toward camera

    // Blend toward pose
    const P = POSES[S.pose] || {};
    for (const s of SIDES) {
      for (const k of ["x", "y", "z"]) S.hand[s][k] = lerp(S.hand[s][k], S.handGoal[s][k], ease);
      for (const k of ["x", "z", "lift"]) S.foot[s][k] = lerp(S.foot[s][k], S.footGoal[s][k], ease);
    }
    S.cog.x = lerp(S.cog.x, S.cogGoal.x, ease);
    S.cog.y = lerp(S.cog.y, S.cogGoal.y, ease);
    S.brow = lerp(S.brow, P.brow ?? 0, ease);
    S.wave = lerp(S.wave, P.wave ?? 0, ease);
    S.bounce = lerp(S.bounce, P.bounce ?? 0, ease);
    S.tilt = lerp(S.tilt, P.tilt ?? 0, ease);
    S.mouth = P.mouth || "smile";

    const live = reduced ? 0 : 1;
    const breath = Math.sin(t / 650) * 1.4 * live;
    const hop = -Math.abs(Math.sin(t / 190)) * 8 * S.bounce * live;

    // ── Skeleton (screen space) ──
    const J = {};
    J.cog = { x: ROOT_X + S.cog.x, y: 262 + S.cog.y + hop };
    const lean = sp * Math.max(0, S.cog.y) * 0.35;        // lean forward when squatting
    J.chest = { x: J.cog.x + lean, y: J.cog.y - 94 + breath };
    J.spine = { x: (J.cog.x + J.chest.x) / 2, y: (J.cog.y + J.chest.y) / 2 };
    J.neck = { x: J.chest.x, y: J.chest.y - 16 };
    J.head = { x: J.neck.x, y: J.neck.y - 38 + breath * 0.4 };
    J.headEnd = { x: J.head.x, y: J.head.y - R };

    const limbDepth = {};
    for (const s of SIDES) {
      // Leg: hip → knee → ankle, knee points the way the character faces
      J[`hip${s}`] = { x: J.cog.x + proj(s * 15, 0), y: J.cog.y + 8 };
      const ft = S.foot[s];
      const ankleT = { x: ROOT_X + proj(ft.x, ft.z), y: GROUND - 12 - ft.lift };
      const leg = ik(J[`hip${s}`], ankleT, LEG[0], LEG[1], { x: sp + s * cp * 0.35, y: 0.05 }, 1.12);
      J[`kn${s}`] = leg.mid; J[`an${s}`] = leg.end;
      J[`toe${s}`] = { x: leg.end.x + sp * 16, y: leg.end.y + 8 };
      limbDepth[`leg${s}`] = depth(s * 15, 0) + depth(ft.x, ft.z) * 0.2;

      // Arm: shoulder → elbow → wrist, elbow points out and back
      J[`sh${s}`] = { x: J.chest.x + proj(s * 34, 0), y: J.chest.y + 8 };
      S.sh[s] = J[`sh${s}`];
      const h = S.hand[s];
      const wave = s === 1 ? Math.sin(t / 105) * 15 * S.wave * live : 0;
      const handT = { x: J[`sh${s}`].x + proj(h.x + wave, h.z), y: J[`sh${s}`].y + h.y + hop * 0.3 };
      const arm = ik(J[`sh${s}`], handT, ARM[0], ARM[1], { x: s * cp - sp * 0.9, y: 0.7 }, 1.3);
      J[`el${s}`] = arm.mid; J[`wr${s}`] = arm.end;
      const ang = Math.atan2(arm.end.y - arm.mid.y, arm.end.x - arm.mid.x);
      J[`hn${s}`] = { x: arm.end.x + Math.cos(ang) * 16, y: arm.end.y + Math.sin(ang) * 16 };
      limbDepth[`arm${s}`] = depth(s * 34, 0) + depth(h.x, h.z) * 0.15;

      // Draw leg
      const L = legs[s];
      const lp = hosePath(J[`hip${s}`], leg.mid, leg.end);
      L.hose.o.setAttribute("d", lp); L.hose.f.setAttribute("d", lp);
      const sx = leg.end.x + sp * 7, sy = leg.end.y + 6;
      const srx = 11 + 7 * Math.abs(sp);
      set(L.shoe, { cx: f(sx), cy: f(sy), rx: f(srx), ry: 7.5 });
      L.lace.setAttribute("d", `M${f(sx - srx * 0.35 + sp * 4)} ${f(sy - 4)}l${f(4 + 2 * Math.abs(sp))} 1`);

      // Draw arm + glove
      const A = arms[s];
      const ap = hosePath(J[`sh${s}`], arm.mid, arm.end);
      A.hose.o.setAttribute("d", ap); A.hose.f.setAttribute("d", ap);
      const flip = (s * cp >= 0 ? 1 : -1) * (Math.cos(ang) >= 0 ? 1 : -1);
      A.glove.setAttribute("transform", `translate(${f(arm.end.x)} ${f(arm.end.y)}) rotate(${f(deg(ang))}) scale(1 ${-flip})`);
    }

    // ── Torso (projected cross-sections) ──
    const top = J.chest.y - 4, bot = J.cog.y + 18;
    const hwT = Math.hypot(34 * cp, 21 * sp), hwB = Math.hypot(37 * cp, 24 * sp);
    const xT = J.chest.x, xB = J.cog.x;
    torso.setAttribute("d",
      `M${f(xT - hwT)} ${f(top + 14)}Q${f(xT - hwT)} ${f(top)} ${f(xT - hwT + 14)} ${f(top)}` +
      `L${f(xT + hwT - 14)} ${f(top)}Q${f(xT + hwT)} ${f(top)} ${f(xT + hwT)} ${f(top + 14)}` +
      `L${f(xB + hwB)} ${f(bot - 8)}Q${f(xB + hwB)} ${f(bot)} ${f(xB + hwB - 8)} ${f(bot)}` +
      `L${f(xB - hwB + 8)} ${f(bot)}Q${f(xB - hwB)} ${f(bot)} ${f(xB - hwB)} ${f(bot - 8)}Z`);
    const hwP = Math.hypot(26 * cp, 18 * sp);
    brief.setAttribute("d", `M${f(xB - hwP)} ${f(J.cog.y + 6)}H${f(xB + hwP)}V${f(J.cog.y + 32)}H${f(xB - hwP)}Z`);

    // A band of the torso surface between two longitudes → visible [minX, maxX]
    const band = (lo, hi, a, b) => {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i <= 16; i++) {
        const l = lo + ((hi - lo) * i) / 16;
        const x3 = a * Math.sin(l), z3 = b * Math.cos(l);
        if (depth(x3, z3) > 0) { const x = proj(x3, z3); mn = Math.min(mn, x); mx = Math.max(mx, x); }
      }
      return mx - mn > 2 ? [mn, mx] : null;
    };
    const pT = band(-0.55, 0.55, 35, 22), pB = band(-0.75, 0.75, 37, 24);
    const py1 = J.cog.y - 18, py2 = J.cog.y + 10;
    const xAt = (y) => lerp(xT, xB, (y - top) / (bot - top));
    show(pocket, pT && pB);
    if (pT && pB) {
      const a = xAt(py1), b = xAt(py2);
      pocket.setAttribute("d", `M${f(a + pT[0])} ${f(py1)}L${f(a + pT[1])} ${f(py1)}L${f(b + pB[1])} ${f(py2)}L${f(b + pB[0])} ${f(py2)}Z`);
    }
    SIDES.forEach((s, i) => {
      const l = s * 0.24, x3 = 34 * Math.sin(l), z3 = 21 * Math.cos(l);
      const vis = depth(x3, z3) > 1;
      const x = xT + proj(x3, z3);
      show(strings[i].l, vis); show(strings[i].tip, vis);
      strings[i].l.setAttribute("d", `M${f(x)} ${f(top + 5)}L${f(x + sp * 2)} ${f(top + 34)}`);
      set(strings[i].tip, { cx: f(x + sp * 2), cy: f(top + 36) });
    });
    {
      const l = -0.5, g = Math.cos(l + phi);
      show(badge, g > 0.05);
      set(badge, { cx: f(xAt(top + 28) + proj(35 * Math.sin(l), 22 * Math.cos(l))), cy: f(top + 28), rx: f(6 * Math.max(g, 0)), ry: 6 });
    }
    const hoodD = depth(0, -21);
    set(hood, { cx: f(xT - 18 * sp), cy: f(top + 4), rx: f(20 + 9 * Math.abs(cp)), ry: 15 });

    // Neck
    const np = `M${f(J.chest.x)} ${f(J.chest.y)}L${f(J.head.x)} ${f(J.head.y + 20)}`;
    neck.o.setAttribute("d", np); neck.f.setAttribute("d", np);

    // ── Head: sphere projection with its own yaw (look-at) ──
    const recent = t - S.look.t < 3000;
    const ldx = recent ? S.look.x - J.head.x : 0, ldy = recent ? S.look.y - J.head.y : 0;
    S.yaw = lerp(S.yaw, clamp(ldx / 170, -1, 1) * rad(32) * cp, reduced ? 1 : 0.08);
    S.pitch = lerp(S.pitch, -clamp(ldy / 220, -1, 1) * 0.16, reduced ? 1 : 0.08);
    const ph = phi + S.yaw, pitch = S.pitch;
    const sph = (lam, beta, r = R) => {
      const b = beta + pitch;
      return { x: r * Math.cos(b) * Math.sin(lam + ph), y: -r * Math.sin(b), d: r * Math.cos(b) * Math.cos(lam + ph), c: Math.cos(lam + ph) };
    };
    const roll = S.tilt + Math.sin(t / 1300) * 1.5 * live;
    headG.setAttribute("transform", `translate(${f(J.head.x)} ${f(J.head.y)}) rotate(${f(roll)})`);

    // Face = the band of the sphere between longitudes ±77°, clipped to the skull
    const phw = wrap(ph), A = rad(77);
    const lo = Math.max(-Math.PI / 2, phw - A), hi = Math.min(Math.PI / 2, phw + A);
    const faceOn = lo < hi;
    show(face, faceOn);
    if (faceOn) {
      const xl = R * Math.sin(lo), xr = R * Math.sin(hi);
      set(face, { cx: f((xl + xr) / 2), cy: f(R * 0.3 - pitch * R * 0.8), rx: f((xr - xl) / 2 + 1), ry: f(R * 0.74) });
    }
    SIDES.forEach((s, i) => {
      const lam = s * 0.45;
      // Eyes
      const e = sph(lam, -0.05);
      const on = e.d > R * 0.15;
      show(eyes[i].g, on);
      const blinking = t > S.blinkAt && t < S.blinkAt + 130;
      const lx = clamp(ldx / 60, -1, 1) * 1.5, ly = clamp(ldy / 60, -1, 1) * 1.5;
      set(eyes[i].ball, { cx: f(e.x + lx), cy: f(e.y + ly), rx: f(5 * Math.max(e.c, 0.3)), ry: blinking ? 0.8 : 7 });
      set(eyes[i].glint, { cx: f(e.x + lx + 1.5 * e.c), cy: f(e.y + ly - 2.5) });
      show(eyes[i].glint, on && !blinking);
      // Brows
      const b = sph(lam, 0.22);
      show(brows[i], b.d > R * 0.15);
      const bw = 7 * Math.max(b.c, 0.3), by = b.y + S.brow;
      brows[i].setAttribute("d", `M${f(b.x - bw)} ${f(by)}Q${f(b.x)} ${f(by - 4)} ${f(b.x + bw)} ${f(by)}`);
      // Cheeks
      const k = sph(s * 0.85, -0.3);
      show(cheeks[i], k.d > R * 0.1);
      set(cheeks[i], { cx: f(k.x), cy: f(k.y), rx: f(6.5 * Math.max(k.c, 0)), ry: 4.5 });
      // Ears
      const ear = sph(s * 1.62, -0.05);
      show(ears[i], ear.d > -R * 0.12);
      set(ears[i], { cx: f(ear.x), cy: f(ear.y), rx: f(4.5 + 5 * Math.abs(ear.c)), ry: 10 });
    });
    if (t > S.blinkAt + 130) S.blinkAt = t + 2200 + Math.random() * 2800;
    const n = sph(0, -0.2, R * 1.07);
    show(nose, n.d > -R * 0.02);
    set(nose, { cx: f(n.x), cy: f(n.y) });
    const m = sph(0, -0.47);
    show(mouth, m.d > R * 0.12);
    const mw = 8 * Math.max(m.c, 0.35);
    if (S.mouth === "open") {
      set(mouth, { fill: C.mouth, d: `M${f(m.x - mw)} ${f(m.y - 1)}Q${f(m.x)} ${f(m.y + 13)} ${f(m.x + mw)} ${f(m.y - 1)}Z` });
    } else {
      set(mouth, { fill: "none", d: `M${f(m.x - mw)} ${f(m.y)}Q${f(m.x)} ${f(m.y + 7)} ${f(m.x + mw)} ${f(m.y)}` });
    }
    const top3 = sph(0.15, 1.35);
    curl.setAttribute("transform", `translate(${f(top3.x)} ${f(top3.y - 2)}) scale(${f(Math.cos(ph) || 0.01)} 1)`);
    const bn = sph(Math.PI, 0.95, R + 6);
    set(bun, { cx: f(bn.x), cy: f(bn.y) });
    // Bun goes in front of or behind the skull
    if (bn.d > 0 && headG.lastChild !== bun) headG.appendChild(bun);
    if (bn.d <= 0 && bun.nextSibling !== skull) headG.insertBefore(bun, skull);

    // ── Depth sort body parts ──
    const order = [];
    const legsSorted = SIDES.slice().sort((a, b) => limbDepth[`leg${a}`] - limbDepth[`leg${b}`]);
    legsSorted.forEach((s) => order.push(legs[s].g));
    const armsSorted = SIDES.slice().sort((a, b) => limbDepth[`arm${a}`] - limbDepth[`arm${b}`]);
    const behind = armsSorted.filter((s) => limbDepth[`arm${s}`] < -6);
    const front = armsSorted.filter((s) => limbDepth[`arm${s}`] >= -6);
    behind.forEach((s) => order.push(arms[s].g));
    if (hoodD < 0) order.push(hood);
    order.push(torsoG, neckG);
    if (hoodD >= 0) order.push(hood);
    order.push(headG);
    front.forEach((s) => order.push(arms[s].g));
    const key = `${legsSorted}|${behind}|${front}|${hoodD < 0}`;
    if (key !== lastOrder) { order.forEach((g) => char.appendChild(g)); lastOrder = key; }

    // ── Skeleton overlay ──
    if (S.skel) {
      BONES.forEach(([a, b], i) => boneEls[i].setAttribute("d", bonePath(J[a], J[b])));
      JOINTS.forEach((j, i) => set(jointEls[i], { cx: f(J[j].x), cy: f(J[j].y) }));
      labelEls.forEach(([j, e]) => set(e, { x: f(J[j].x + 8), y: f(J[j].y - 6) }));
    }

    // ── Controls ──
    if (S.ctrls) {
      set(cogRing, { cx: f(J.cog.x), cy: f(J.cog.y + 4) });
      for (const s of SIDES) {
        handCtrl[s].setAttribute("transform", `translate(${f(J[`wr${s}`].x + (J[`hn${s}`].x - J[`wr${s}`].x) * 0.5)} ${f(J[`wr${s}`].y + (J[`hn${s}`].y - J[`wr${s}`].y) * 0.5)})`);
        set(footCtrl[s], { x: f(J[`an${s}`].x + sp * 7 - 20), y: f(J[`an${s}`].y - 5) });
      }
    }

    // ── HUD + toolbar sync ──
    const a = deg(wrap(phi));
    const abs = Math.abs(a);
    const view = abs < 22.5 ? "FRONT" : abs < 67.5 ? "3/4 FRONT" : abs < 112.5 ? "SIDE" : abs < 157.5 ? "3/4 BACK" : "BACK";
    const ry = String(Math.round(a < 0 ? a + 360 : a) % 360).padStart(3, "0");
    hudL.textContent = `char_rig_v1 · rotY ${ry}° · IK`;
    if (view !== lastView) {
      hudR.textContent = view;
      lastView = view;
      bar?.querySelectorAll("[data-view]").forEach((b) => {
        const v = +b.dataset.view;
        b.setAttribute("aria-pressed", Math.abs(wrap(rad(v) - phi)) < rad(22.5) || (v === 45 && abs >= 22.5 && abs < 67.5) || (v === 90 && abs >= 67.5 && abs < 112.5));
      });
    }
    if (slider && document.activeElement !== slider) slider.value = Math.round(a);
  }

  // Intro: wave hello, then run a model-sheet turnaround until the visitor takes over
  const t0 = performance.now();
  let introDone = reduced;
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);
  syncBar();
  function tick(t) {
    if (!introDone && t - t0 > 2600) {
      introDone = true;
      if (!S.touched) startAuto();
    }
    if (visible) frame(t);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
