// Nav border on scroll
const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Reveal on scroll
const revealables = document.querySelectorAll(".section__head, .project, .timeline li, .skill, .about__grid, .contact");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  revealables.forEach((el) => { el.classList.add("reveal"); io.observe(el); });
}

// ── IK rig: a 4-bone arm solved with FABRIK, like a rig's IK handle ──
(function rig() {
  const svg = document.getElementById("rig");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  const bonesG = svg.querySelector("#rig-bones");
  const target = svg.querySelector("#rig-target");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = { x: 200, y: 360 };
  const lengths = [95, 80, 60, 40];
  const names = ["jnt_shoulder", "jnt_elbow", "jnt_wrist", "jnt_hand"];
  const total = lengths.reduce((a, b) => a + b, 0);

  // Joints start pointing straight up
  let pts = [{ ...root }];
  lengths.forEach((l, i) => pts.push({ x: root.x, y: pts[i].y - l }));

  const goal = { x: 290, y: 130 };   // where the control wants to be
  const ctrl = { x: 290, y: 130 };   // eased control position

  // Build SVG elements once
  const bones = lengths.map(() => bonesG.appendChild(document.createElementNS(NS, "path")));
  bones.forEach((b) => b.setAttribute("class", "rig__bone"));
  const joints = pts.map((_, i) => {
    const c = bonesG.appendChild(document.createElementNS(NS, "circle"));
    c.setAttribute("r", i === 0 ? 9 : 6);
    c.setAttribute("class", i === 0 ? "rig__root" : "rig__joint");
    return c;
  });
  const labels = names.map((n) => {
    const t = bonesG.appendChild(document.createElementNS(NS, "text"));
    t.setAttribute("class", "rig__label");
    t.textContent = n;
    return t;
  });

  function solve(tx, ty) {
    const dx = tx - root.x, dy = ty - root.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= total) {
      // Out of reach: stretch straight toward the target
      for (let i = 0; i < lengths.length; i++) {
        const r = lengths[i] / Math.hypot(tx - pts[i].x, ty - pts[i].y);
        pts[i + 1] = { x: pts[i].x + (tx - pts[i].x) * r, y: pts[i].y + (ty - pts[i].y) * r };
      }
      return;
    }
    for (let iter = 0; iter < 12; iter++) {
      // Backward pass
      pts[pts.length - 1] = { x: tx, y: ty };
      for (let i = pts.length - 2; i >= 0; i--) {
        const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) || 1;
        const r = lengths[i] / d;
        pts[i] = { x: pts[i + 1].x + (pts[i].x - pts[i + 1].x) * r, y: pts[i + 1].y + (pts[i].y - pts[i + 1].y) * r };
      }
      // Forward pass
      pts[0] = { ...root };
      for (let i = 0; i < pts.length - 1; i++) {
        const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) || 1;
        const r = lengths[i] / d;
        pts[i + 1] = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r };
      }
      if (Math.hypot(pts[pts.length - 1].x - tx, pts[pts.length - 1].y - ty) < 0.5) break;
    }
  }

  // Maya-style bone: a thin diamond from joint A to joint B
  function bonePath(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = Math.min(12, len * 0.14);
    const mx = a.x + dx * 0.18, my = a.y + dy * 0.18;
    return `M${a.x},${a.y} L${mx + nx * w},${my + ny * w} L${b.x},${b.y} L${mx - nx * w},${my - ny * w} Z`;
  }

  function draw() {
    bones.forEach((b, i) => b.setAttribute("d", bonePath(pts[i], pts[i + 1])));
    joints.forEach((c, i) => { c.setAttribute("cx", pts[i].x); c.setAttribute("cy", pts[i].y); });
    labels.forEach((t, i) => { t.setAttribute("x", pts[i].x + 12); t.setAttribute("y", pts[i].y + 4); });
    target.setAttribute("transform", `translate(${ctrl.x} ${ctrl.y})`);
  }

  function toSvg(e) {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 400, y: ((e.clientY - r.top) / r.height) * 400 };
  }

  let lastInput = 0;
  window.addEventListener("pointermove", (e) => {
    const p = toSvg(e);
    // Follow the cursor anywhere on the page, clamped to the canvas
    goal.x = Math.max(16, Math.min(384, p.x));
    goal.y = Math.max(16, Math.min(384, p.y));
    lastInput = performance.now();
    if (reduced) { ctrl.x = goal.x; ctrl.y = goal.y; solve(ctrl.x, ctrl.y); draw(); }
  }, { passive: true });

  solve(ctrl.x, ctrl.y);
  draw();
  if (reduced) return;

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);

  function tick(t) {
    if (visible) {
      // Idle: gentle figure-eight so the rig is alive on touch devices too
      if (t - lastInput > 2500) {
        goal.x = 250 + Math.sin(t / 1400) * 90;
        goal.y = 150 + Math.sin(t / 700) * 45;
      }
      ctrl.x += (goal.x - ctrl.x) * 0.14;
      ctrl.y += (goal.y - ctrl.y) * 0.14;
      solve(ctrl.x, ctrl.y);
      draw();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
