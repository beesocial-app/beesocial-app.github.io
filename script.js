// A few small bits of motion for the Bee Social website. All of it is decoration,
// and none of it runs for anyone who has asked their device to reduce motion.
(function () {
  "use strict";

  var motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
  if (!motion.matches) return;

  // Cards rise in, and the highlighter sweeps in behind headings, as they scroll
  // into view. Only things that start below the fold are hidden first, so nothing
  // already on screen ever blinks.
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.classList.contains("card")) el.style.transitionDelay = (n++ * 90) + "ms";
        el.classList.add("shown");
        observer.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px" });

    document.querySelectorAll("main h2, main .card").forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add("reveal");
      observer.observe(el);
    });
  }

  var bee = document.querySelector(".hero-bee");
  if (!bee) return;

  // Tap or click the bee by the headline and it loops the loop.
  bee.addEventListener("click", function () { bee.classList.add("loop"); });
  bee.addEventListener("animationend", function (event) {
    if (event.animationName === "bee-loop") bee.classList.remove("loop");
  });
})();
