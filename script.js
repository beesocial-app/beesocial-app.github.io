// What moves below the top of the page. The top itself is started by the few
// lines in the page's <head>. Nothing here runs for anyone who has asked their
// device to reduce motion, and without this file the page simply shows at rest.
(function () {
  "use strict";

  var root = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The list of things Tweak can take out: tapping one brings it back, as its
  // switch does in the app. This works with or without movement.
  var choose = document.querySelector(".choose");
  if (choose) {
    var cuts = choose.querySelectorAll(".cut");
    for (var c = 0; c < cuts.length; c++) {
      cuts[c].addEventListener("click", function () {
        // After the first tap the lines stop waiting their turn.
        choose.classList.add("struck", "settled");
        this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
      });
    }
  }

  if (still || !("IntersectionObserver" in window)) return;

  // Splits a headline into words, each in its own little window (see style.css).
  // The headline keeps its full text as its name, so screen readers read it whole.
  function split(el, className, wrap) {
    var words = el.textContent.trim().split(/\s+/);
    var holder = document.createElement("span");
    holder.setAttribute("aria-hidden", "true");
    for (var i = 0; i < words.length; i++) {
      var word = document.createElement("span");
      word.className = className;
      word.style.setProperty("--i", i);
      if (wrap) {
        var inner = document.createElement("span");
        inner.textContent = words[i];
        word.appendChild(inner);
      } else {
        word.textContent = words[i];
      }
      holder.appendChild(word);
      if (i < words.length - 1) holder.appendChild(document.createTextNode(" "));
    }
    el.setAttribute("aria-label", words.join(" "));
    el.textContent = "";
    el.appendChild(holder);
    return holder.children;
  }

  // Headlines already written out word by word in the page are left as they are.
  var rises = document.querySelectorAll("[data-rise]");
  for (var r = 0; r < rises.length; r++) {
    if (!rises[r].querySelector(".w")) split(rises[r], "w", true);
  }

  var statement = document.querySelector("[data-reveal]");
  var lit = statement ? split(statement, "rw", false) : [];

  root.classList.add("anim");

  // Marks each thing "in" the first time it is properly on screen.
  var arrive = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      entries[i].target.classList.add("in");
      arrive.unobserve(entries[i].target);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
  var arriving = document.querySelectorAll("[data-rise], [data-in]");
  for (var a = 0; a < arriving.length; a++) arrive.observe(arriving[a]);

  // The pink lines draw once most of the list is on screen.
  var list = choose && choose.querySelector(".out .words");
  if (list) {
    var strike = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      choose.classList.add("struck");
      strike.disconnect();
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.6 });
    strike.observe(list);
  }

  // The ticker runs only while it is on screen, and holds still under a pointer
  // or after a tap. Scrolling hurries it along (see below).
  var ticker = document.querySelector(".ticker");
  var track = ticker && ticker.querySelector(".track");
  var running = null;
  if (ticker) {
    new IntersectionObserver(function (entries) {
      ticker.classList.toggle("run", entries[0].isIntersecting);
      running = null;
    }).observe(ticker);
    ticker.addEventListener("click", function () { ticker.classList.toggle("held"); });
    ticker.addEventListener("mouseenter", function () { ticker.classList.add("held"); });
    ticker.addEventListener("mouseleave", function () { ticker.classList.remove("held"); });
  }

  // The top of the page is pinned while the rest slides over it, but only when
  // all of it fits on screen: pinned any taller, its button could never be reached.
  var hero = document.querySelector(".hero");
  function fit() {
    if (hero) root.classList.toggle("pin", hero.scrollHeight <= window.innerHeight + 2);
  }
  fit();
  window.addEventListener("resize", fit);

  // One pass per frame while the page is scrolling.
  var best = 0, lastY = window.scrollY, speed = 1, waiting = false;

  function frame() {
    waiting = false;
    var y = window.scrollY, h = window.innerHeight;

    // How far the top has been covered, for it to sink back and fade.
    if (hero && y < hero.offsetHeight * 1.2) {
      hero.style.setProperty("--cover", Math.min(1, Math.max(0, y / (hero.offsetHeight * 0.85))).toFixed(3));
    }

    // The statement lights up word by word as it climbs the screen. It only ever
    // gets brighter, so scrolling back up never dims what has been read.
    if (lit.length && best < 1) {
      var box = statement.getBoundingClientRect();
      var from = h * 0.9, to = h * 0.34;
      var p = box.bottom < 0 ? 1 : (from - box.top) / (from - to);
      if (p > best) {
        best = Math.min(p, 1);
        var reach = best * (lit.length + 2);
        for (var i = 0; i < lit.length; i++) {
          var o = Math.max(0, Math.min(1, (reach - i) / 2));
          lit[i].style.opacity = (0.2 + 0.8 * o).toFixed(3);
        }
      }
    }

    // The ticker speeds up with the scroll, then eases back to its own pace.
    if (track && track.getAnimations && ticker.classList.contains("run")) {
      if (!running) running = track.getAnimations()[0] || null;
      var push = Math.min(7, Math.abs(y - lastY) * 0.09);
      speed = Math.max(speed + (1 - speed) * 0.12, 1 + push);
      if (running) running.playbackRate = speed;
      if (speed > 1.02) ask();
    }
    lastY = y;
  }
  function ask() {
    if (waiting) return;
    waiting = true;
    window.requestAnimationFrame(frame);
  }
  window.addEventListener("scroll", ask, { passive: true });
  window.addEventListener("resize", ask);
  frame();

  // On a computer, the ink edge of the pink words leans away from the pointer,
  // as if the pointer were a lamp.
  var pink = document.querySelectorAll("h1 em, .get h2 em");
  if (pink.length && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    window.addEventListener("pointermove", function (event) {
      for (var i = 0; i < pink.length; i++) {
        var box = pink[i].getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) continue;
        var dx = (box.left + box.width / 2 - event.clientX) / window.innerWidth;
        var dy = (box.top + box.height / 2 - event.clientY) / window.innerHeight;
        var x = Math.max(-1, Math.min(1, dx * 2.2)), y = Math.max(-1, Math.min(1, dy * 2.2));
        // Never quite flat, so the edge is always there.
        if (Math.abs(x) < 0.25 && Math.abs(y) < 0.25) { x = 0.25; y = 0.25; }
        pink[i].style.setProperty("--sx", (x * 0.05).toFixed(4) + "em");
        pink[i].style.setProperty("--sy", (y * 0.05).toFixed(4) + "em");
      }
    }, { passive: true });
  }
})();
