// ─────────────────────────────────────────────────────────────
//  2.5D character rig
//  - hierarchical skeleton: COG → spine → chest → neck → head
//  - 2-bone IK arms & legs solved in 3D with pole vectors and stretch
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
    shirt: "#e8491d", shirtShade: "#b9370f", pants: "#2d3142",
    shoe: "#f7f4ee", glove: "#ffffff", cheek: "#ff8a7a", mouth: "#7a2630",
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
      lace: $("path", { fill: "none", stroke: C.shirt, "stroke-width": 2.5, "stroke-linecap": "round" }, g) };
  }
  // Arms
  const arms = {};
  for (const s of SIDES) {
    const g = $("g", {});
    const glove = $("g", {});
    const thumb = $("circle", { r: 5.5, cx: 7, cy: -9, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    $("circle", { r: 11.5, cx: 8, cy: 0, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    $("rect", { x: -5, y: -9, width: 8, height: 18, rx: 3, fill: C.glove, stroke: C.line, "stroke-width": OUT }, glove);
    arms[s] = { g, hose: hose(g, C.skin, 14), sleeve: hose(g, C.shirt, 20), glove, thumb };
    g.appendChild(glove);
  }
  // Torso
  const torsoG = $("g", {});
  const brief = $("path", { fill: C.pants }, torsoG);
  const torso = $("path", { fill: C.shirt, stroke: C.line, "stroke-width": OUT, "stroke-linejoin": "round" }, torsoG);
  // Neck
  const neckG = $("g", {});
  const neck = hose(neckG, C.skin, 15);
  const collar = $("path", { fill: "none", stroke: C.shirtShade, "stroke-width": 4, "stroke-linecap": "round" }, neckG);
  // Head (drawn in head-local space, then translated/rotated)
  const headG = $("g", {});
  const bun = $("circle", { r: 17, fill: C.hair, stroke: C.line, "stroke-width": OUT }, headG);
  const skull = $("circle", { r: R, fill: C.hair, stroke: C.line, "stroke-width": OUT }, headG);
  const face = $("path", { fill: C.skin, "clip-path": "url(#rig-headclip)" }, headG);
  $("circle", { r: R, fill: "none", stroke: C.line, "stroke-width": OUT }, headG);   // outline over the face edge
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
  const cogRing = $("ellipse", { rx: 46, ry: 10 }, cogCtrl);
  const handCtrl = {}, footCtrl = {};
  for (const s of SIDES) {
    footCtrl[s] = $("rect", { class: `ctrl ctrl--${tag(s)}`, "data-ctrl": "foot", "data-side": s, rx: 6, width: 36, height: 20 }, ctrls);
  }
  for (const s of SIDES) {
    const g = $("g", { class: `ctrl ctrl--${tag(s)}`, "data-ctrl": "hand", "data-side": s }, ctrls);
    $("circle", { r: 14 }, g);
    $("path", { d: "M-19 0H-14M14 0H19M0 -19V-14M0 14V19" }, g);
    handCtrl[s] = g;
  }

  // ── Math helpers ──
  // Two-bone IK solved in 3D (rig space: x right, y down, z toward camera at rotY 0),
  // so a knee that bends toward the camera foreshortens instead of bowing sideways.
  function ik3(a, t, l1, l2, pole, maxStretch) {
    const dx = t.x - a.x, dy = t.y - a.y, dz = t.z - a.z;
    const d = Math.hypot(dx, dy, dz) || 0.001;
    const k = clamp(d / (l1 + l2), 1, maxStretch);   // stretchy IK
    const L1 = l1 * k, L2 = l2 * k;
    const dc = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 0.01);
    const u = { x: dx / d, y: dy / d, z: dz / d };
    const pd = pole.x * u.x + pole.y * u.y + pole.z * u.z;
    let w = { x: pole.x - pd * u.x, y: pole.y - pd * u.y, z: pole.z - pd * u.z };
    const wl = Math.hypot(w.x, w.y, w.z);
    w = wl > 1e-4 ? { x: w.x / wl, y: w.y / wl, z: w.z / wl } : { x: 0, y: 0, z: 1 };
    const ca = clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1), sa = Math.sqrt(1 - ca * ca);
    return {
      mid: { x: a.x + L1 * (u.x * ca + w.x * sa), y: a.y + L1 * (u.y * ca + w.y * sa), z: a.z + L1 * (u.z * ca + w.z * sa) },
      end: { x: a.x + u.x * dc, y: a.y + u.y * dc, z: a.z + u.z * dc },
    };
  }
  const hosePath = (a, m, b) => {
    const cx = 2 * m.x - (a.x + b.x) / 2, cy = 2 * m.y - (a.y + b.y) / 2;   // curve passes through m
    return `M${f(a.x)} ${f(a.y)}Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`;
  };
  // The first `u` (0–1) of the same curve hosePath draws
  const hoseSegment = (a, m, b, u) => {
    const c = { x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2 };
    const q = { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
    const e = { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * c.y + u * u * b.y };
    return `M${f(a.x)} ${f(a.y)}Q${f(q.x)} ${f(q.y)} ${f(e.x)} ${f(e.y)}`;
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
      S.cogGoal = { x: clamp(d.cog0.x + p.x - d.x0, -40, 40), y: clamp(d.cog0.y + p.y - d.y0, -8, 30) };
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
    const lean = sp * Math.max(0, S.cog.y) * 0.35;        // lean forward when squatting (matches chest3)
    J.chest = { x: J.cog.x + lean, y: J.cog.y - 94 + breath };
    J.spine = { x: (J.cog.x + J.chest.x) / 2, y: (J.cog.y + J.chest.y) / 2 };
    J.neck = { x: J.chest.x, y: J.chest.y - 16 };
    J.head = { x: J.neck.x, y: J.neck.y - 38 + breath * 0.4 };
    J.headEnd = { x: J.head.x, y: J.head.y - R };

    const limbDepth = {};
    // 3D helpers: rig space → screen, and depth toward the camera
    const scr = (p) => ({ x: ROOT_X + p.x * cp + p.z * sp, y: p.y });
    const dep = (p) => -p.x * sp + p.z * cp;
    const cog3 = { x: S.cog.x * cp, y: J.cog.y, z: S.cog.x * sp };
    const chest3 = { x: cog3.x, y: J.chest.y, z: cog3.z + Math.max(0, S.cog.y) * 0.35 };
    for (const s of SIDES) {
      // Leg: hip → knee → ankle; knee points forward and slightly out
      const hip3 = { x: cog3.x + s * 15, y: J.cog.y + 8, z: cog3.z };
      const ft = S.foot[s];
      const ankle3 = { x: ft.x, y: GROUND - 12 - ft.lift, z: ft.z };
      const leg3 = ik3(hip3, ankle3, LEG[0], LEG[1], { x: s * 0.3, y: 0, z: 1 }, 1.12);
      J[`hip${s}`] = scr(hip3); J[`kn${s}`] = scr(leg3.mid); J[`an${s}`] = scr(leg3.end); J[`ft${s}`] = scr(ankle3);
      const leg = { mid: J[`kn${s}`], end: J[`an${s}`] };
      J[`toe${s}`] = { x: leg.end.x + sp * 16, y: leg.end.y + 8 };
      limbDepth[`leg${s}`] = dep(hip3) + dep(leg3.mid) * 0.2;

      // Arm: shoulder → elbow → wrist; elbow points out, down and back (pole vector)
      const sh3 = { x: chest3.x + s * 34, y: chest3.y + 8, z: chest3.z };
      J[`sh${s}`] = scr(sh3);
      S.sh[s] = J[`sh${s}`];
      const h = S.hand[s];
      const wave = s === 1 ? Math.sin(t / 105) * 15 * S.wave * live : 0;
      const hand3 = { x: sh3.x + h.x + wave, y: sh3.y + h.y + hop * 0.3, z: sh3.z + h.z };
      const arm3 = ik3(sh3, hand3, ARM[0], ARM[1], { x: s, y: 0.7, z: -0.9 }, 1.3);
      const arm = { mid: scr(arm3.mid), end: scr(arm3.end) };
      J[`el${s}`] = arm.mid; J[`wr${s}`] = arm.end; J[`ht${s}`] = scr(hand3);
      const ang = Math.atan2(arm.end.y - arm.mid.y, arm.end.x - arm.mid.x);
      J[`hn${s}`] = { x: arm.end.x + Math.cos(ang) * 16, y: arm.end.y + Math.sin(ang) * 16 };
      limbDepth[`arm${s}`] = dep(sh3) - dep(chest3) + (dep(arm3.mid) - dep(sh3)) * 0.3;
      limbDepth[`hand${s}`] = dep(arm3.end) - dep(chest3);   // hand vs. the head's centre plane

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
      const sl = hoseSegment(J[`sh${s}`], arm.mid, arm.end, 0.3);   // short sleeve
      A.sleeve.o.setAttribute("d", sl); A.sleeve.f.setAttribute("d", sl);
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
    // Pelvis: rounded, and only as deep as the legs in profile so it never pokes out
    const hwP = Math.hypot(25 * cp, 11 * sp), pY = J.cog.y;
    brief.setAttribute("d", `M${f(xB - hwP)} ${f(pY + 4)}H${f(xB + hwP)}V${f(pY + 16)}Q${f(xB + hwP)} ${f(pY + 28)} ${f(xB)} ${f(pY + 28)}Q${f(xB - hwP)} ${f(pY + 28)} ${f(xB - hwP)} ${f(pY + 16)}Z`);

    // Neck
    const np = `M${f(J.chest.x)} ${f(J.chest.y)}L${f(J.head.x)} ${f(J.head.y + 20)}`;
    neck.o.setAttribute("d", np); neck.f.setAttribute("d", np);
    // Crew collar: dips toward the camera from the front, flattens in profile
    const cw = Math.hypot(12 * cp, 9 * sp), dip = 9 * cp;
    collar.setAttribute("d", `M${f(xT - cw)} ${f(top + 1)}Q${f(xT + 6 * sp)} ${f(top + 1 + dip * 2)} ${f(xT + cw)} ${f(top + 1)}`);

    // ── Head: a real sphere with its own yaw (look-at) and pitch ──
    const recent = t - S.look.t < 3000;
    const ldx = recent ? S.look.x - J.head.x : 0, ldy = recent ? S.look.y - J.head.y : 0;
    S.yaw = lerp(S.yaw, clamp(ldx / 170, -1, 1) * rad(32) * cp, reduced ? 1 : 0.08);
    S.pitch = lerp(S.pitch, -clamp(ldy / 220, -1, 1) * 0.16, reduced ? 1 : 0.08);
    const ph = phi + S.yaw;
    const cP = Math.cos(S.pitch), sP = Math.sin(S.pitch), cY = Math.cos(ph), sY = Math.sin(ph);
    // head-local (y up) → view space: pitch about X, then yaw about Y; and the inverse
    const toView = (x, y, z) => { const y1 = y * cP + z * sP, z1 = -y * sP + z * cP; return { x: x * cY + z1 * sY, y: y1, z: -x * sY + z1 * cY }; };
    const toLocal = (x, y, z) => { const x0 = x * cY - z * sY, z1 = x * sY + z * cY; return { x: x0, y: y * cP - z1 * sP, z: y * sP + z1 * cP }; };
    const lonLat = (lon, lat) => toView(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    const sph = (lon, lat, r = R) => { const v = lonLat(lon, lat); return { x: r * v.x, y: -r * v.y, d: r * v.z, c: v.z }; };
    const roll = S.tilt + Math.sin(t / 1300) * 1.5 * live;
    headG.setAttribute("transform", `translate(${f(J.head.x)} ${f(J.head.y)}) rotate(${f(roll)})`);

    // Face = an oval patch of the sphere (in longitude/latitude). Project its outline;
    // where the outline slips behind the head, follow the silhouette instead.
    const FW = 1.32, FC = -0.465, FH = 0.785;
    const inFace = (v) => { const l = toLocal(v.x, v.y, v.z); const lon = Math.atan2(l.x, l.z), lat = Math.asin(clamp(l.y, -1, 1)); return (lon / FW) ** 2 + ((lat - FC) / FH) ** 2 <= 1; };
    const NF = 72, FP = [];
    for (let i = 0; i < NF; i++) { const a = (i / NF) * Math.PI * 2; FP.push(lonLat(FW * Math.cos(a), FC + FH * Math.sin(a))); }
    const vis = FP.map((p) => p.z >= 0);
    const toLimb = (a, b) => { const u = a.z / (a.z - b.z); const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u; const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l, z: 0 }; };
    let facePts = null;
    if (vis.every(Boolean)) facePts = FP;
    else if (vis.some(Boolean)) {
      facePts = [];
      const s0 = vis.findIndex((v, i) => v && !vis[(i - 1 + NF) % NF]);
      for (let k = 0; k < NF; k++) {
        const i = (s0 + k) % NF, j = (i + 1) % NF;
        facePts.push(FP[i]);
        if (!vis[j]) {
          let m = j; while (!vis[(m + 1) % NF]) m = (m + 1) % NF;
          const n = (m + 1) % NF, e0 = toLimb(FP[i], FP[j]), e1 = toLimb(FP[m], FP[n]);
          const a0 = Math.atan2(e0.y, e0.x);
          let da = wrap(Math.atan2(e1.y, e1.x) - a0);
          const mid = a0 + da / 2;
          if (!inFace({ x: Math.cos(mid), y: Math.sin(mid), z: 0 })) da -= Math.sign(da) * Math.PI * 2;
          const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.08));
          for (let q = 0; q <= steps; q++) { const a = a0 + (da * q) / steps; facePts.push({ x: Math.cos(a), y: Math.sin(a), z: 0 }); }
          const kn = (n - s0 + NF) % NF;
          if (kn === 0) break;
          k = kn - 1;
        }
      }
    }
    show(face, !!facePts);
    if (facePts) face.setAttribute("d", "M" + facePts.map((p) => `${f(p.x * R)} ${f(-p.y * R)}`).join("L") + "Z");

    const blinking = t > S.blinkAt && t < S.blinkAt + 130;
    const lx = clamp(ldx / 60, -1, 1) * 1.5, ly = clamp(ldy / 60, -1, 1) * 1.5;
    SIDES.forEach((s, i) => {
      const lam = s * 0.42;
      const e = sph(lam, -0.02);
      const on = e.c > 0.22;
      show(eyes[i].g, on);
      set(eyes[i].ball, { cx: f(e.x + lx * e.c), cy: f(e.y + ly), rx: f(5 * Math.max(e.c, 0.3)), ry: blinking ? 0.8 : 7 });
      set(eyes[i].glint, { cx: f(e.x + lx * e.c + 1.5 * e.c), cy: f(e.y + ly - 2.5) });
      show(eyes[i].glint, on && !blinking);
      const b = sph(lam, 0.24);
      show(brows[i], b.c > 0.22);
      const bw = 7 * Math.max(b.c, 0.3), by = b.y + S.brow;
      brows[i].setAttribute("d", `M${f(b.x - bw)} ${f(by)}Q${f(b.x)} ${f(by - 4)} ${f(b.x + bw)} ${f(by)}`);
      const k = sph(s * 0.8, -0.3);
      show(cheeks[i], k.c > 0.15);
      set(cheeks[i], { cx: f(k.x), cy: f(k.y), rx: f(6.5 * Math.max(k.c, 0)), ry: 4.5 });
      const ear = sph(s * 1.62, -0.08);
      show(ears[i], ear.c > -0.3);
      set(ears[i], { cx: f(ear.x), cy: f(ear.y), rx: f(4.5 + 5 * Math.abs(ear.c)), ry: 10 });
    });
    if (t > S.blinkAt + 130) S.blinkAt = t + 2200 + Math.random() * 2800;
    const n = sph(0, -0.2, R * 1.07);
    show(nose, n.c > -0.02);
    set(nose, { cx: f(n.x), cy: f(n.y) });
    const m = sph(0, -0.5);
    show(mouth, m.c > 0.2);
    const mw = 8 * Math.max(m.c, 0.35);
    if (S.mouth === "open") {
      set(mouth, { fill: C.mouth, d: `M${f(m.x - mw)} ${f(m.y - 1)}Q${f(m.x)} ${f(m.y + 13)} ${f(m.x + mw)} ${f(m.y - 1)}Z` });
    } else {
      set(mouth, { fill: "none", d: `M${f(m.x - mw)} ${f(m.y)}Q${f(m.x)} ${f(m.y + 7)} ${f(m.x + mw)} ${f(m.y)}` });
    }
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
    // Arms: behind the torso, between torso and head, or in front of the head
    const behind = armsSorted.filter((s) => limbDepth[`arm${s}`] < -6);
    const midArms = armsSorted.filter((s) => limbDepth[`arm${s}`] >= -6 && limbDepth[`hand${s}`] <= 4);
    const front = armsSorted.filter((s) => limbDepth[`arm${s}`] >= -6 && limbDepth[`hand${s}`] > 4);
    behind.forEach((s) => order.push(arms[s].g));
    order.push(torsoG, neckG);
    midArms.forEach((s) => order.push(arms[s].g));
    order.push(headG);
    front.forEach((s) => order.push(arms[s].g));
    const key = `${legsSorted}|${behind}|${midArms}|${front}`;
    if (key !== lastOrder) { order.forEach((g) => char.appendChild(g)); lastOrder = key; }

    // ── Skeleton overlay ──
    if (S.skel) {
      BONES.forEach(([a, b], i) => boneEls[i].setAttribute("d", bonePath(J[a], J[b])));
      JOINTS.forEach((j, i) => set(jointEls[i], { cx: f(J[j].x), cy: f(J[j].y) }));
      labelEls.forEach(([j, e]) => {
        const side = j.endsWith("-1") ? -1 : j.endsWith("1") ? 1 : 0;
        let on = true;
        if (side) {
          // When the L/R pair overlaps (side views), only label the nearer joint
          const twin = j.slice(0, -(side < 0 ? 2 : 1)) + (side < 0 ? "1" : "-1");
          const kind = j.startsWith("kn") ? "leg" : "arm";
          const near = limbDepth[`${kind}${side}`] >= limbDepth[`${kind}${-side}`];
          if (Math.hypot(J[j].x - J[twin].x, J[j].y - J[twin].y) < 28 && !near) on = false;
        }
        show(e, on);
        const right = side ? J[j].x >= J.chest.x : j !== "cog";
        set(e, { x: f(J[j].x + (right ? 9 : -9)), y: f(J[j].y + 3), "text-anchor": right ? "start" : "end" });
      });
    }

    // ── Controls sit on the IK targets, not the solved joints ──
    if (S.ctrls) {
      set(cogRing, { cx: f(J.cog.x), cy: f(J.cog.y + 24) });
      for (const s of SIDES) {
        const ht = J[`ht${s}`], ft = J[`ft${s}`];
        handCtrl[s].setAttribute("transform", `translate(${f(ht.x)} ${f(ht.y)})`);
        set(footCtrl[s], { x: f(ft.x + sp * 7 - 18), y: f(ft.y - 4) });
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
