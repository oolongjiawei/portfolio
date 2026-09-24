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


// Before / after comparison (Karkumi v1 vs v2)
document.querySelectorAll(".compare").forEach((fig) => {
  const stage = fig.querySelector(".compare__stage");
  const range = fig.querySelector(".compare__range");
  const imgs = { v1: fig.querySelector('[data-v="v1"]'), v2: fig.querySelector('[data-v="v2"]') };
  range.addEventListener("input", () => stage.style.setProperty("--pos", `${range.value}%`));
  fig.querySelectorAll("button[data-device]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const device = btn.dataset.device;
      fig.dataset.device = device;
      fig.querySelectorAll("button[data-device]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      for (const v of ["v1", "v2"]) {
        imgs[v].src = `assets/karkumi-${v}-${device}.jpg`;
        imgs[v].width = device === "mobile" ? 496 : 1280;
        imgs[v].height = device === "mobile" ? 780 : 800;
      }
    });
  });
});
