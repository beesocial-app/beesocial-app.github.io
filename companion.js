// The bee by the headline keeps you company as you scroll down the page.
//
// When you start scrolling it flies up out of sight. Once you stop, it drops
// down the right-hand side of the screen to the line you're reading, turns to
// face it, flies in head first and bumps into the end of it. Then it bounces
// back out to the side, turned away, before turning round again to hover there
// and keep an eye on it. Each time you move on and stop again it does the same,
// a little more warily than before. It keeps to its lane down the right-hand
// side the whole time: on a phone that's just inside the edge of the screen,
// and on a wider screen it's the empty margin to the right of the text. While
// you scroll it follows along lazily in its lane, and back at the top it flies
// home and settles beside the headline. Nothing here runs if your device is set
// to reduce motion.
(function () {
  "use strict";

  var motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
  if (!motion.matches) return;
  var hero = document.querySelector(".hero-bee");
  if (!hero) return;

  var LEAVE_AT = 90;    // scrolled this far down, the bee sets off
  var HOME_AT = 40;     // back above this, it flies home
  var IDLE_MS = 450;    // this long without scrolling counts as stopped
  var DOT_GAP = 11;     // pixels between trail dots
  var READ_AT = 0.4;    // the line you're reading is taken to be this far down the screen
  var WIDE = 860;       // from this wide, there's room for the bee in the margin beside the text
  var NOSE = 0.38;      // middle of the bee to the tip of its nose, as a share of its width
  var MIN_DAB = 12;     // the shortest run-up it takes at the words, in pixels

  // One entry per visit, from bold to wary. Speeds are in pixels a second.
  // approach: speed on the way in; wait: how long it hovers just short of the
  // words first; peck: whether it dabs forward and backs off before committing;
  // final: speed of the last stretch; recoil: how hard it bounces off.
  // All of it is kept very slow, so the bee drifts rather than darts.
  var VISITS = [
    { approach: 52, wait: 0,    peck: false, final: 52, recoil: 46 },
    { approach: 36, wait: 1200, peck: false, final: 25, recoil: 33 },
    { approach: 25, wait: 1800, peck: true,  final: 16, recoil: 24 },
  ];
  var FOLLOW_SPEED = 110;   // top speed while you scroll (slow, so it lags behind)
  var RETURN_SPEED = 160;   // top speed on the way home
  var TRAIL_MIN = 8;        // it only leaves dots when flying faster than this

  // The following bee is a copy of the headline bee in a fixed layer. Its trail
  // is drawn into the page itself, so the dots scroll away like footprints.
  var box = document.createElement("div");
  box.className = "companion";
  box.setAttribute("aria-hidden", "true");
  var turn = document.createElement("div");
  turn.className = "companion-turn";
  var art = hero.cloneNode(true);
  art.setAttribute("class", "bee");
  var bob = art.querySelector(".bee-bob");
  turn.appendChild(art);
  box.appendChild(turn);
  document.body.appendChild(box);
  var trail = document.createElement("div");
  trail.className = "trail-layer";
  trail.setAttribute("aria-hidden", "true");
  document.body.appendChild(trail);

  var column = document.querySelector("main");
  var texts = Array.prototype.slice.call(document.querySelectorAll("main > p, main > h2, main > .card, main > footer"));

  var mode = "home";    // home, takeoff, away, visit, follow or return
  var phase = "";       // the step within a visit
  var x = 0, y = 0, vx = 0, vy = 0, smoothVx = 0;   // page coordinates; pixels a second
  var w = 0, h = 0, face = 1, faceShown = 1, faceLock = 0;   // face 1 = looking left
  var visits = 0, plan = null, spot = null, until = 0;
  var lastScrollAt = -1e9, frameScroll = 0, follow = null;
  var lastDot = null, running = false, last = 0, clock = 0, lastWidth = viewWidth();

  function now() { return performance.now(); }
  function viewWidth() { return document.documentElement.clientWidth; }
  function scrolling() { return now() - lastScrollAt < IDLE_MS; }

  function homeSpot() {
    var r = hero.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + window.scrollY + r.height / 2, w: r.width, h: r.height };
  }

  // The middle of the bee's lane down the right-hand side. On a phone that's
  // just inside the edge of the screen, but never left of the edge of the text
  // column, so it never sits over the words it's about to visit. On a wider
  // screen it's the empty margin to the right of the text.
  function laneX() {
    var vw = viewWidth(), lane = vw - w / 2 - 6;
    if (!column) return lane;
    var c = column.getBoundingClientRect();
    if (vw >= WIDE) return Math.min(lane, c.right + 24 + w / 2);
    return Math.min(edgeX(), Math.max(lane, columnRight()));
  }

  // The furthest right it goes with all of it still on the screen whichever
  // way it's facing (its head reaches 0.43 of its width from the middle), and
  // the furthest it goes while facing left, with its tail (0.36) on the screen.
  function edgeX() { return viewWidth() - 0.43 * w - 2; }
  function snugX() { return viewWidth() - 0.36 * w - 1; }

  // The right-hand end of the content nearest the line you're reading, in
  // viewport coordinates: the end of a line of words, or the edge of a card.
  // Only content that runs (nearly) to the right-hand edge of the text column
  // counts, so the bee keeps to its side of the screen and never crosses over
  // to the end of a short line, a heading or the button. If nothing in view
  // qualifies it returns null and the bee just hovers in its lane.
  function contentInView() {
    var vh = window.innerHeight, read = vh * READ_AT, best = null, bestScore = Infinity;
    var reach = columnRight() - 1.5 * w;
    texts.forEach(function (el) {
      edgesOf(el).forEach(function (e) {
        if (e.right < reach) return;
        var pad = Math.min(h * 0.6, (e.bottom - e.top) / 2);
        var mid = e.card ? Math.max(e.top + pad, Math.min(e.bottom - pad, read)) : (e.top + e.bottom) / 2;
        if (mid < vh * 0.14 || mid > vh * 0.8) return;
        if (Math.abs(mid - read) < bestScore) { bestScore = Math.abs(mid - read); best = { y: mid, right: e.right }; }
      });
    });
    return best;
  }

  // The right-hand edge of the text inside the column (inside its padding).
  function columnRight() {
    if (!column) return viewWidth();
    return column.getBoundingClientRect().right - parseFloat(window.getComputedStyle(column).paddingRight || 0);
  }

  // Each line of a block of text, measured from the words themselves (and any
  // highlighted words or buttons among them) rather than the box around them.
  // A card counts as one box, and the bee bumps into its edge.
  function edgesOf(el) {
    if (el.classList.contains("card")) {
      var c = el.getBoundingClientRect();
      return [{ top: c.top, bottom: c.bottom, right: c.right, card: true }];
    }
    var range = document.createRange();
    range.selectNodeContents(el);
    var rects = range.getClientRects(), lines = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i], mid = (r.top + r.bottom) / 2, line = null;
      if (r.width < 1 || r.height < 1) continue;
      for (var j = 0; j < lines.length && !line; j++) {
        if (mid > lines[j].top && mid < lines[j].bottom) line = lines[j];
      }
      if (line) line.right = Math.max(line.right, r.right);
      else lines.push({ top: r.top, bottom: r.bottom, right: r.right });
    }
    return lines;
  }

  // True when the bee is wholly above or below the screen.
  function offScreen() {
    var sy2 = y - window.scrollY;
    return sy2 < -h / 2 || sy2 > window.innerHeight + h / 2;
  }

  function clampScreenY(py) { return Math.max(h / 2 + 8, Math.min(window.innerHeight - h / 2 - 8, py)); }

  // Plan a visit to the content in view: where it lines up in its lane level
  // with the end of the line, where its nose will touch the words, points just
  // short of that for hesitating, and where it hovers afterwards. If there's
  // nothing to visit it just hovers in its lane beside the line you're reading.
  function planVisit(fromAbove) {
    var c = contentInView(), sy = window.scrollY, lane = laneX();
    plan = VISITS[Math.min(visits, VISITS.length - 1)];
    var level = clampScreenY(c ? c.y + 0.04 * h : window.innerHeight * READ_AT) + sy;
    spot = { start: { x: lane, y: level }, hover: { x: lane, y: level }, hit: null };
    if (c) {
      // Where the words run nearly to the edge of the screen there's no room
      // for a proper run-up, so it tucks right up against the edge and makes
      // a short dab, never going further left than the end of the line.
      var hitX = c.right + NOSE * w;
      spot.start.x = Math.min(snugX(), Math.max(lane, hitX + MIN_DAB));
      hitX = Math.max(c.right, Math.min(hitX, spot.start.x - MIN_DAB));
      var room = spot.start.x - hitX;
      if (room >= 2) {
        spot.edge = c.right;
        spot.hit = { x: hitX, y: level };
        spot.near = { x: hitX + Math.min(30, room * 0.6), y: level };
        spot.peck = { x: hitX + Math.min(10, room * 0.2), y: level };
        spot.hover.x = Math.min(edgeX(), Math.max(lane, hitX + 4));
      } else {
        spot.start.x = spot.hover.x = Math.min(edgeX(), Math.max(lane, c.right + 4));
      }
    }
    if (fromAbove) { x = spot.start.x; y = sy - h; vx = vy = 0; lastDot = null; }
    else { vx *= 0.4; vy *= 0.4; }   // settle down after following you
    mode = "visit";
    phase = "lineup";
    faceLock = 0;
  }

  // Steer towards a point at up to `max` pixels a second. `ease` sets how far
  // out it starts slowing (a big number means it arrives at full speed, as when
  // it bumps into something) and `grip` how quickly it changes speed.
  function steer(t, max, ease, grip, dt) {
    var dx = t.x - x, dy = t.y - y, d = Math.sqrt(dx * dx + dy * dy);
    var want = Math.min(max, d * ease), k = Math.min(1, dt * grip);
    var ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 0;
    vx += (ux * want - vx) * k;
    vy += (uy * want - vy) * k;
    return d;
  }

  // Match the flying bee's size to the headline bee's (which changes with the
  // width of the screen).
  function fitSize() {
    var s = homeSpot();
    w = s.w; h = s.h;
    box.style.width = w + "px";
    box.style.height = h + "px";
    return s;
  }

  function setOff() {
    var s = fitSize();
    x = s.x; y = s.y; vx = 0; vy = -40;
    face = faceShown = 1; faceLock = 0; lastDot = null;
    mode = "takeoff";
    // Keep its bobbing in step with the headline bee, so the swap never jumps.
    var heroBob = hero.querySelector(".bee-bob"), anims = heroBob && heroBob.getAnimations ? heroBob.getAnimations() : [];
    if (bob && anims.length) {
      var cycle = 2 * (anims[0].effect.getComputedTiming().duration || 2400);   // up and back down
      bob.style.animationDelay = -(anims[0].currentTime % cycle) + "ms";
    }
    hero.classList.add("away");
    box.classList.add("on");
    start();
  }

  function settle() {
    mode = "home";
    running = false;
    visits = 0;
    box.classList.remove("on");
    hero.classList.remove("away");
  }

  function dot(px, py) {
    var d = document.createElement("span");
    d.className = "bee-dot";
    d.style.left = Math.max(3, Math.min(viewWidth() - 3, px)).toFixed(1) + "px";
    d.style.top = py.toFixed(1) + "px";
    d.addEventListener("animationend", function () { d.remove(); });
    trail.appendChild(d);
    if (trail.childElementCount > 160) trail.firstChild.remove();
  }

  function step(dt, t) {
    var sy = window.scrollY, vh = window.innerHeight, d;
    clock += dt;

    if (mode === "away") {
      // Out of sight above the screen until you stop scrolling, then it drops in.
      if (t < until || scrolling()) { frameScroll = sy; return; }
      planVisit(true);
    }

    if (mode === "takeoff") {
      steer({ x: x + 30, y: sy - 2 * h }, 150, 6, 1.5, dt);
      if (y - sy < -h) {
        mode = "away";
        until = t + 1200 + Math.random() * 1200;
        box.style.transform = "translate3d(-300px,-300px,0)";
        frameScroll = sy;
        return;
      }
    } else if (mode === "return") {
      var home = homeSpot();
      d = steer(home, RETURN_SPEED, 2.5, 2, dt);
      if (d < 60) faceLock = 1;   // turn to face the way the headline bee does before landing
      if (d < 2.5 && Math.sqrt(vx * vx + vy * vy) < 30) { settle(); return; }
    } else if (mode === "follow") {
      // Keep the same height on the screen, in its lane, catching up slowly
      // while you scroll. If you scroll faster than it flies it drops out of
      // sight, and when you stop it comes back in from the top rather than
      // flying the whole way.
      steer({ x: laneX(), y: sy + follow.y }, FOLLOW_SPEED, 2, 1.2, dt);
      if (!scrolling()) planVisit(offScreen());
    } else if (mode === "visit") {
      if (phase === "lineup") {
        // Along its lane to the height of the words, slowing to a stop there.
        // Once it's in line with them it turns to face them.
        d = steer(spot.start, plan.approach, 2.5, 3, dt);
        faceLock = Math.abs(spot.start.x - x) < 12 ? 1 : 0;
        if (d < 1.5 && Math.sqrt(vx * vx + vy * vy) < 5) {
          phase = !spot.hit ? "hover" : plan.wait ? "approach" : "final";
        }
      } else if (phase === "approach") {
        if (steer(spot.near, plan.approach, 2.5, 3, dt) < 2) { phase = "wait"; until = t + plan.wait; }
      } else if (phase === "wait") {
        steer(spot.near, 12, 2, 2, dt);
        if (t > until) phase = plan.peck ? "peck" : "final";
      } else if (phase === "peck") {
        if (steer(spot.peck, 18, 30, 3, dt) < 2) phase = "peekback";
      } else if (phase === "peekback") {
        if (steer(spot.near, 14, 3, 2, dt) < 2) { phase = "pause"; until = t + 800; }
      } else if (phase === "pause") {
        steer(spot.near, 12, 2, 2, dt);
        if (t > until) phase = "final";
      } else if (phase === "final") {
        d = steer(spot.hit, plan.final, 40, plan.wait ? 6 : 3, dt);
        if (d < Math.max(2, plan.final * dt * 1.5)) {
          // Bump! It bounces back out to its lane, turning away as it goes.
          // Near the edge of the screen it bounces off more gently, so it
          // doesn't fly off the side.
          vx = smoothVx = Math.min(plan.recoil * 0.6, Math.max(10, (edgeX() - x) * 2));
          vy = -plan.recoil;
          visits++;
          faceLock = 0;
          phase = "flyoff";
        }
      } else if (phase === "flyoff") {
        d = steer(spot.hover, plan.recoil, 2.2, 2.5, dt);
        if (d < 3 && Math.sqrt(vx * vx + vy * vy) < 8) { phase = "turn"; until = t + 600; }
      } else if (phase === "turn") {
        steer(spot.hover, 6, 2, 2, dt);
        if (t > until) { phase = "hover"; faceLock = 1; }
      } else {
        // Hovering: a small, very slow drift, still facing the words, which
        // never takes it past the end of the line or off the side of the screen.
        var driftX = Math.min(snugX(), spot.hover.x + 4 * Math.sin(clock * 0.2));
        if (spot.hit) driftX = Math.max(spot.hit.x, driftX);
        steer({ x: driftX, y: spot.hover.y + 3 * Math.sin(clock * 0.28 + 1) + 1.5 * Math.sin(clock * 0.6) }, 4, 1, 1, dt);
      }
    }

    x += vx * dt;
    y += vy * dt;
    if (mode === "visit") {
      // Pressed right up against the edge of a phone's screen, it stops there
      // rather than poking off the side.
      var maxX = face === 1 ? snugX() : edgeX();
      if (x > maxX) { x = maxX; if (vx > 0) vx = 0; }
    }
    frameScroll = sy;

    // It faces the way it's flying (or towards the words it's eyeing up),
    // turning round quickly, and dips its head when it's heading down.
    smoothVx += (vx - smoothVx) * Math.min(1, dt * 8);
    if (faceLock) face = faceLock;
    else if (smoothVx > 6) face = -1;
    else if (smoothVx < -6) face = 1;
    faceShown += (face - faceShown) * Math.min(1, dt * 10);
    var tilt = Math.max(-20, Math.min(20, -vy * 0.05));

    box.style.transform = "translate3d(" + (x - w / 2).toFixed(1) + "px," + (y - sy - h / 2).toFixed(1) + "px,0)";
    turn.style.transform = "scaleX(" + faceShown.toFixed(3) + ") rotate(" + tilt.toFixed(1) + "deg)";

    // The dotted trail, dropped behind its tail.
    var speed = Math.sqrt(vx * vx + vy * vy), screenY = y - sy;
    if (speed > TRAIL_MIN && screenY > -h && screenY < vh + h) {
      var tailX = x + faceShown * w * 0.38, tailY = y + h * 0.06;
      if (!lastDot || Math.abs(tailX - lastDot.x) + Math.abs(tailY - lastDot.y) >= DOT_GAP) {
        dot(tailX, tailY);
        lastDot = { x: tailX, y: tailY };
      }
    }
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    step(dt, t);
    if (running) window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = now();
    window.requestAnimationFrame(frame);
  }

  function onScroll() {
    var sy = window.scrollY;
    lastScrollAt = now();
    if (mode === "home") {
      if (sy > LEAVE_AT) setOff();
    } else if (sy < HOME_AT) {
      if (mode !== "return") {
        // Out of sight (gone, or left far behind): come home from just above the screen.
        if (mode === "away" || offScreen()) { var s = homeSpot(); x = s.x + 40; y = sy - h; vx = vy = 0; lastDot = null; }
        mode = "return"; faceLock = 0; start();
      }
    } else if (mode === "visit" || (mode === "return" && sy > LEAVE_AT)) {
      // You've moved on: follow along in its lane from where it was on the screen.
      mode = "follow";
      faceLock = 0;
      follow = { y: Math.max(h, Math.min(window.innerHeight * 0.7, y - frameScroll)) };
    }
  }

  // Turning a phone round, or resizing the window, moves the words and the
  // lane. The bee resizes, moves straight across to its new lane rather than
  // flying over the words, and treats it like a scroll: it follows along and
  // visits afresh. (A phone's toolbar sliding away changes only the height.)
  function onResize() {
    var vw = viewWidth();
    if (vw === lastWidth) return;
    lastWidth = vw;
    if (mode === "home") return;
    fitSize();
    if (mode === "visit" || mode === "follow") { x = laneX(); vx = 0; lastDot = null; }
    onScroll();
  }

  // If someone turns on Reduce Motion while the bee is out, send it straight home.
  function onMotionChange() {
    if (!motion.matches && mode !== "home") settle();
  }
  if (motion.addEventListener) motion.addEventListener("change", onMotionChange);

  window.addEventListener("scroll", function () { if (motion.matches) onScroll(); }, { passive: true });
  window.addEventListener("resize", function () { if (motion.matches) onResize(); });
  if (window.scrollY > LEAVE_AT) onScroll();
})();
