(() => {
  // Selection is disabled everywhere on the site (backs up the
  // `user-select: none` CSS, which some browsers still let Ctrl+A /
  // Cmd+A bypass).
  document.addEventListener('selectstart', event => {
    event.preventDefault();
  });

  document.addEventListener('keydown', event => {
    const key = (event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'a') {
      event.preventDefault();
    }
  });

  const isPages = location.pathname.includes('/pages/');
  const starRoot = isPages ? 'assets/images/stars' : 'assets/images/stars';
  const starFiles = ['1.png', '2.png', '3.png'];
  const maxStars = 20;
  const storageKey = 'silentium-site-seed';

  let starsStarted = false;
  let buttonTimers = [];

  function getSeed() {
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing && /^\d+$/.test(existing)) return Number(existing);
      const generated = Math.floor(Math.random() * 2 ** 31) >>> 0;
      localStorage.setItem(storageKey, String(generated));
      return generated;
    } catch {
      return Math.floor(Math.random() * 2 ** 31) >>> 0;
    }
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const seed = getSeed();
  const random = mulberry32(seed);

  function rand(min, max) {
    return min + random() * (max - min);
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function animateTitle() {
    const title = document.getElementById('title');
    if (!title) return;

    const text = title.dataset.title || title.dataset.originalTitle || title.textContent.trim() || document.title.trim();
    if (!text) return;

    title.dataset.originalTitle = text;
    title.textContent = '';

    for (const ch of text) {
      const span = document.createElement('span');
      span.textContent = ch;
      title.appendChild(span);
    }

    title.querySelectorAll('span').forEach((letter, index) => {
      const y = -80 - rand(0, 140);
      const rotate = -18 + rand(0, 36);
      const delay = index * 35 + rand(0, 180);
      const duration = 900 + rand(0, 400);

      letter.animate(
        [
          { opacity: 0, transform: `translateY(${y}px) rotate(${rotate}deg)` },
          { opacity: 1, transform: 'translateY(0) rotate(0deg)' }
        ],
        {
          duration,
          delay,
          easing: 'cubic-bezier(.2,.9,.25,1)',
          fill: 'forwards'
        }
      );
    });
  }

  function animateSubtitle() {
    const subtitle = document.getElementById('subtitle');
    if (!subtitle) return;

    const text = subtitle.dataset.subtitle || subtitle.dataset.originalSubtitle || subtitle.textContent.trim();
    if (!text) return;

    subtitle.dataset.originalSubtitle = text;
    subtitle.replaceChildren();

    const chars = Array.from(text);
    const center = (chars.length - 1) / 2;

    chars.forEach((ch, index) => {
      const span = document.createElement('span');
      span.textContent = ch === ' ' ? ' ' : ch;
      subtitle.appendChild(span);

      const distance = Math.abs(index - center);
      const delay = Math.round(distance * 95 + (index % 2) * 16);
      const sideShift = (index - center) * 6;
      const rise = 18;

      span.getAnimations().forEach(animation => animation.cancel());
      span.animate(
        [
          { opacity: 0, transform: `translate(${sideShift}px, ${rise}px) scale(0.96)` },
          { opacity: 1, transform: 'translate(0, 0) scale(1)' }
        ],
        {
          duration: 620 + distance * 40,
          delay,
          easing: 'cubic-bezier(.2,.9,.25,1)',
          fill: 'forwards'
        }
      );
    });
  }

  function animateButton() {
    const buttons = Array.from(document.querySelectorAll('#left-hero .discord-button, #left-hero .characters-page-button, #left-hero .trailer-button, #top-left-button .back-to-home-button, .back .back-to-characters-button'));
    if (!buttons.length) return;

    buttonTimers.forEach(clearTimeout);
    buttonTimers = [];

    buttons.forEach((button, index) => {
      button.classList.remove('in');
      void button.offsetWidth;
      const timer = setTimeout(() => button.classList.add('in'), 160 + index * 110);
      buttonTimers.push(timer);
    });
  }

  // Star images are fetched once per page (revalidated, so they are always
  // current but only re-downloaded when they really changed) and every star
  // is just a clone of the already decoded image.
  async function loadStarImages() {
    const images = await Promise.all(starFiles.map(async file => {
      const url = `${starRoot}/${file}`;
      let src = url;

      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) src = URL.createObjectURL(await response.blob());
      } catch {}

      const img = new Image();
      img.decoding = 'async';
      img.src = src;

      try {
        await img.decode();
        return img;
      } catch {
        return null;
      }
    }));

    return images.filter(Boolean);
  }

  async function spawnStars() {
    if (starsStarted) return;
    starsStarted = true;

    const starsLayer = document.getElementById('stars');
    if (!starsLayer) return;

    const starImages = await loadStarImages();
    if (!starImages.length) return;

    const stars = [];
    let frameRequested = false;
    let lastFrameTime = 0;

    // 30 FPS normally, less while the window is in the background or the
    // donate / image window (blurred backdrop) is open.
    function getFrameInterval() {
      if (!document.hasFocus()) return 100;
      if (document.body.classList.contains('donate-modal-open') || document.body.classList.contains('modal-open')) return 66;
      return 33;
    }

    function spawnStar() {
      if (stars.length >= maxStars) return;

      const img = starImages[Math.floor(random() * starImages.length)].cloneNode();
      const size = rand(18, 64);
      const startX = rand(0, Math.max(1, window.innerWidth - size));
      const startY = rand(0, Math.max(1, window.innerHeight - size));

      img.style.width = size + 'px';
      img.style.height = size + 'px';
      img.style.left = startX + 'px';
      img.style.top = startY + 'px';
      img.style.opacity = '0';

      stars.push({
        img,
        driftX: rand(-5, 5),
        driftY: rand(-5, 5),
        rotateTo: rand(-3, 3),
        swayPhase: rand(0, Math.PI * 2),
        swaySpeedX: rand(0.25, 0.55),
        swaySpeedY: rand(0.25, 0.55),
        swayAmountX: rand(0.15, 0.45),
        swayAmountY: rand(0.15, 0.45),
        life: rand(7000, 9200),
        fadeIn: rand(800, 1800),
        fadeOut: rand(800, 1800),
        started: 0
      });

      starsLayer.appendChild(img);
      requestFrame();
    }

    function animateStars(now) {
      frameRequested = false;

      if (now - lastFrameTime < getFrameInterval() - 1) {
        requestFrame();
        return;
      }
      lastFrameTime = now;

      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i];
        if (!star.started) star.started = now;

        const elapsed = now - star.started;
        if (elapsed >= star.life) {
          star.img.remove();
          stars.splice(i, 1);
          continue;
        }

        let opacity = 0;
        if (elapsed < star.fadeIn) opacity = elapsed / star.fadeIn;
        else if (elapsed < star.life - star.fadeOut) opacity = 1;
        else opacity = 1 - ((elapsed - (star.life - star.fadeOut)) / star.fadeOut);

        const smooth = easeInOut(Math.max(0, Math.min(1, elapsed / star.life)));
        const wobbleX = Math.sin((elapsed / 1000) * star.swaySpeedX + star.swayPhase) * star.swayAmountX;
        const wobbleY = Math.cos((elapsed / 1000) * star.swaySpeedY + star.swayPhase) * star.swayAmountY;
        const x = star.driftX * smooth + wobbleX;
        const y = star.driftY * smooth + wobbleY;
        const rot = star.rotateTo * smooth;

        star.img.style.opacity = String(Math.max(0, Math.min(1, opacity)));
        star.img.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      }

      if (stars.length) requestFrame();
    }

    function requestFrame() {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(animateStars);
    }

    function burstStars() {
      if (document.hidden || starsLayer.style.display === 'none') return;

      const count = 2 + Math.floor(random() * 4);
      for (let i = 0; i < count; i++) {
        setTimeout(spawnStar, random() * 300);
      }
    }

    for (let i = 0; i < 20; i++) {
      setTimeout(spawnStar, i * 80);
    }
    setInterval(burstStars, 140);
  }

  function replayIntroAnimations() {
    animateTitle();
    animateSubtitle();
    animateButton();
  }

  document.addEventListener('DOMContentLoaded', () => {
    animateTitle();
    animateSubtitle();
    animateButton();
    spawnStars();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      requestAnimationFrame(replayIntroAnimations);
      return;
    }
    replayIntroAnimations();
  });
})();
