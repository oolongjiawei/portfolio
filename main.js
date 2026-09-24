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


// Before / after comparison (Karkumi v1 vs v2), by page and device
document.querySelectorAll(".compare").forEach((fig) => {
  const stage = fig.querySelector(".compare__stage");
  const range = fig.querySelector(".compare__range");
  const imgs = { v1: fig.querySelector('[data-v="v1"]'), v2: fig.querySelector('[data-v="v2"]') };
  range.addEventListener("input", () => stage.style.setProperty("--pos", `${range.value}%`));

  const render = () => {
    const { page, device } = fig.dataset;
    for (const v of ["v1", "v2"]) {
      imgs[v].src = `assets/karkumi-${v}-${page}-${device}.jpg`;
      imgs[v].width = device === "mobile" ? 786 : 1280;
      imgs[v].height = device === "mobile" ? 1596 : 800;
    }
  };
  for (const key of ["page", "device"]) {
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
