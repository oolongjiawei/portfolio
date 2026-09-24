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


// Before / after comparison (Karkumi 2025 or v1 vs v2), by version, page and device
const BEFORE = {
  v0: { tag: "2025 · mine", alt: "Karkumi Cafe, my first site from 2025" },
  v1: { tag: "v1 · live", alt: "Karkumi Cafe v1, live" },
};
document.querySelectorAll(".compare").forEach((fig) => {
  const stage = fig.querySelector(".compare__stage");
  const range = fig.querySelector(".compare__range");
  const before = fig.querySelector('[data-v="before"]');
  const after = fig.querySelector('[data-v="v2"]');
  const beforeTag = fig.querySelector(".compare__tag--l");
  range.addEventListener("input", () => stage.style.setProperty("--pos", `${range.value}%`));

  const render = () => {
    const { page, device } = fig.dataset;
    const b = fig.dataset.before;
    for (const [img, v] of [[before, b], [after, "v2"]]) {
      img.src = `assets/karkumi-${v}-${page}-${device}.jpg`;
      img.width = device === "mobile" ? 786 : 1280;
      img.height = device === "mobile" ? 1596 : 800;
    }
    before.alt = BEFORE[b].alt;
    beforeTag.textContent = BEFORE[b].tag;
  };
  for (const key of ["before", "page", "device"]) {
    const buttons = fig.querySelectorAll(`button[data-${key}]`);
    buttons.forEach((btn) => btn.addEventListener("click", () => {
      fig.dataset[key] = btn.dataset[key];
      buttons.forEach((b) => b.setAttribute("aria-pressed", b === btn));
      render();
    }));
  }
});

// Fortune House showcase: cross-fade through the demo screens
document.querySelectorAll(".showcase").forEach((fig) => {
  const imgs = [...fig.querySelectorAll(".showcase__stage img")];
  const dots = [...fig.querySelectorAll(".showcase__dots button")];
  const label = fig.querySelector(".showcase__label");
  let i = 0, timer = null;
  const go = (n) => {
    i = (n + imgs.length) % imgs.length;
    imgs.forEach((im, k) => im.classList.toggle("is-on", k === i));
    dots.forEach((d, k) => d.setAttribute("aria-pressed", k === i));
    label.textContent = dots[i].dataset.label;
  };
  const play = () => { if (!timer && !matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(() => go(i + 1), 3200); };
  const stop = () => { clearInterval(timer); timer = null; };
  dots.forEach((d, k) => d.addEventListener("click", () => { stop(); go(k); }));
  fig.addEventListener("mouseenter", stop);
  fig.addEventListener("mouseleave", play);
  fig.addEventListener("focusin", stop);
  play();
});

// job-radar: step through the pipeline once it scrolls into view
document.querySelectorAll(".flow").forEach((flow) => {
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver(([e]) => flow.classList.toggle("is-live", e.isIntersecting), { threshold: 0.4 }).observe(flow);
});
