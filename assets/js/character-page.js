(() => {
  const characterRoot = 'assets/chatacters';
  const iconRoot = 'assets/images/social_media_icons';
  const charactersListPath = `${characterRoot}/characters.json`;
  const content = document.getElementById('content');

  let introTimers = [];
  let currentFolder = '';
  let currentInfo = null;

  const normalizeText = (value, fallback = '') =>
    String(value ?? '').trim() || fallback;

  function cacheBustedUrl(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${Date.now()}`;
  }

  function getVisageUrl(uuid) {
    if (!uuid) {
      return '';
    }

    return `https://visage.surgeplay.com/full/832/${uuid}?autocrop&v=${Date.now()}`;
  }

  let currentPortraitObjectUrl = null;

  async function loadPortraitFresh(imgElement, url) {
    if (!imgElement || !url) {
      return;
    }

    try {
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      imgElement.src = objectUrl;

      if (currentPortraitObjectUrl) {
        URL.revokeObjectURL(currentPortraitObjectUrl);
      }

      currentPortraitObjectUrl = objectUrl;
    } catch (error) {
      console.warn('Не удалось загрузить актуальный скин напрямую:', error);
    }
  }

  const triggerFileCache = new Map();

  async function hasBlackoutTrigger(folder) {
    if (triggerFileCache.has(folder)) {
      return triggerFileCache.get(folder);
    }

    let exists = false;

    try {
      const response = await fetch(
        `${characterRoot}/${encodeURIComponent(folder)}/lany.trigger`,
        {
          method: 'HEAD',
          cache: 'no-store'
        }
      );

      exists = response.ok;
    } catch (error) {
      exists = false;
    }

    triggerFileCache.set(folder, exists);
    return exists;
  }

  const clickTriggerCache = new Map();

  async function loadClickTrigger(folder) {
    if (clickTriggerCache.has(folder)) {
      return clickTriggerCache.get(folder);
    }

    const result = await new Promise(resolve => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          resolve({
            pixels: imageData.data,
            width: canvas.width,
            height: canvas.height
          });
        } catch (error) {
          console.warn(
            `Не удалось прочитать click_trigger.png для "${folder}":`,
            error
          );
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);

      img.src = `${characterRoot}/${encodeURIComponent(folder)}/click_trigger.png?v=${Date.now()}`;
    });

    clickTriggerCache.set(folder, result);
    return result;
  }

  const interactionStateCache = new Map();

  function loadInteractionState(folder) {
    if (interactionStateCache.has(folder)) {
      return interactionStateCache.get(folder);
    }

    const promise = (async () => {
      const blackout = await hasBlackoutTrigger(folder);
      const clickTrigger = blackout
        ? await loadClickTrigger(folder)
        : null;

      return { blackout, clickTrigger };
    })();

    interactionStateCache.set(folder, promise);
    return promise;
  }

  function isRedTriggerPixel(mask, x, y) {
    if (
      !mask ||
      x < 0 ||
      y < 0 ||
      x >= mask.width ||
      y >= mask.height
    ) {
      return false;
    }

    const index =
      (Math.floor(y) * mask.width + Math.floor(x)) * 4;

    const r = mask.pixels[index];
    const g = mask.pixels[index + 1];
    const b = mask.pixels[index + 2];
    const a = mask.pixels[index + 3];

    return a > 10 && r > 200 && g < 60 && b < 60;
  }

  function pointerToImagePixel(imgElement, clientX, clientY) {
    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    if (!naturalWidth || !naturalHeight) {
      return null;
    }

    const rect = imgElement.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    const scale = Math.min(
      rect.width / naturalWidth,
      rect.height / naturalHeight
    );

    const renderWidth = naturalWidth * scale;
    const renderHeight = naturalHeight * scale;

    const offsetX = rect.left + (rect.width - renderWidth) / 2;
    const offsetY = rect.top + (rect.height - renderHeight) / 2;

    const x = (clientX - offsetX) / scale;
    const y = (clientY - offsetY) / scale;

    return { x, y };
  }

  function extractFolders(payload) {
    if (Array.isArray(payload)) {
      return payload
        .map(item =>
          typeof item === 'string' || typeof item === 'number'
            ? String(item).trim()
            : ''
        )
        .filter(Boolean);
    }

    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.folders)) {
        return extractFolders(payload.folders);
      }

      if (Array.isArray(payload.characters)) {
        return extractFolders(payload.characters);
      }
    }

    return [];
  }

  async function loadFolders() {
    try {
      const response = await fetch(charactersListPath, {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return extractFolders(data);
    } catch (error) {
      console.error('Не удалось прочитать characters.json:', error);
      return [];
    }
  }

  async function loadInfo(folder) {
    try {
      const response = await fetch(
        `${characterRoot}/${encodeURIComponent(folder)}/info.json`,
        {
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn(
        `Не удалось прочитать info.json для папки ${folder}:`,
        error
      );

      return null;
    }
  }

  function getFolderFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return normalizeText(params.get('id'), '');
  }

  function resolveIconUrl(icon) {
    const iconName = normalizeText(icon);

    if (!iconName) {
      return '';
    }

    if (/\.[a-z0-9]+$/i.test(iconName)) {
      return `${iconRoot}/${iconName}`;
    }

    return `${iconRoot}/${iconName}.png`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function formatText(value, fallback = '') {
    const text = String(value ?? '');

    if (!text.trim()) {
      return escapeHtml(fallback);
    }

    return text
      .split(/<new_line>/gi)
      .map(part => escapeHtml(part))
      .join('<br>');
  }

  function nextFrame() {
    return new Promise(resolve =>
      requestAnimationFrame(() => resolve())
    );
  }

  function waitForImage(image) {
    if (!image) {
      return Promise.resolve();
    }

    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const done = () => {
        image.removeEventListener('load', done);
        image.removeEventListener('error', done);
        resolve();
      };

      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });
  }

  function getModalElements() {
    const modal = document.getElementById('image-modal');

    if (!modal) {
      return null;
    }

    const closeButton = modal.querySelector('.image-modal__close');
    const image = modal.querySelector('.image-modal__img');
    const panel = modal.querySelector('.image-modal__panel');
    const lens = modal.querySelector('.image-lens');

    return {
      modal,
      closeButton,
      image,
      panel,
      lens
    };
  }

  let closeModalTimer = null;
  let currentCardArt = null;
  let currentClickTrigger = null;
  const MODAL_TRANSITION_MS = 1000;
  const TRIGGER_SEQUENCE_STEP_MS = 2000;
  const TRIGGER_SEQUENCE_BLINK_MS = 1000;
  const TRIGGER_SEQUENCE_TEXTS = [
    'Не знаю чего жаждешь ',
    'Не знаю чего ищешь',
    'Но не буду стоять на пути',
    'Далее..'
  ];
  let triggerSequenceRunning = false;
  let triggerSequenceTimers = [];
  let lensActive = false;
  let lensZoom = 1;

  function clearTriggerSequenceTimers() {
    triggerSequenceTimers.forEach(timer => {
      clearTimeout(timer);
      clearInterval(timer);
    });
    triggerSequenceTimers = [];
  }

  function createTriggerEndingText(element, text) {
    element.innerHTML = '';

    Array.from(text).forEach((character, index) => {
      const span = document.createElement('span');
      span.className = 'trigger-sequence__ending-letter';
      span.textContent = character === ' ' ? '\u00a0' : character;
      span.style.setProperty('--x', `${-6 + ((index * 7) % 13)}px`);
      span.style.setProperty('--y', `${-6 + ((index * 11) % 13)}px`);
      span.style.setProperty('--r', `${-2 + ((index * 5) % 5)}deg`);
      span.style.setProperty('--delay', `${(index * 17) % 90}ms`);
      element.appendChild(span);
    });
  }

  function startTriggerSequence() {
    if (triggerSequenceRunning) {
      return;
    }

    triggerSequenceRunning = true;
    clearTriggerSequenceTimers();

    const refs = getModalElements();
    const oldSequence = document.querySelector('.trigger-sequence');
    oldSequence?.remove();

    const sequence = document.createElement('div');
    sequence.className = 'trigger-sequence';
    sequence.innerHTML = `
      <div class="trigger-sequence__white"></div>
      <div class="trigger-sequence__far">
        <img src="assets/images/backgrounds/far.png" alt="" draggable="false">
      </div>
      <div class="trigger-sequence__dialog">
        <div class="trigger-sequence__dialog-text"></div>
      </div>
      <div class="trigger-sequence__ending">
        <div class="trigger-sequence__ending-text"></div>
      </div>
    `;
    document.body.appendChild(sequence);

    const white = sequence.querySelector('.trigger-sequence__white');
    const far = sequence.querySelector('.trigger-sequence__far');
    const dialog = sequence.querySelector('.trigger-sequence__dialog-text');
    const ending = sequence.querySelector('.trigger-sequence__ending');
    const endingText = sequence.querySelector('.trigger-sequence__ending-text');

    document.body.classList.add('trigger-sequence-active');
    white.classList.add('fade');

    triggerSequenceTimers.push(
      window.setTimeout(() => {
        const contentElement = document.getElementById('content');
        const background = document.getElementById('page-bg');
        const stars = document.getElementById('stars');
        const back = document.querySelector('.back');

        if (contentElement) {
          contentElement.innerHTML = '';
        }

        if (background) {
          background.style.display = 'none';
        }

        if (stars) {
          stars.innerHTML = '';
          stars.style.display = 'none';
        }

        if (back) {
          back.style.display = 'none';
        }

        if (refs) {
          refs.modal.hidden = true;
          refs.modal.classList.remove('open');
          refs.modal.setAttribute('aria-hidden', 'true');
          refs.image.src = '';
          refs.image.classList.remove('hot', 'trigger-hot');
        }
      }, TRIGGER_SEQUENCE_STEP_MS),
      window.setTimeout(() => {
        far.classList.add('active');
      }, TRIGGER_SEQUENCE_STEP_MS * 2),
      window.setTimeout(() => {
        dialog.classList.add('visible');
        dialog.textContent = TRIGGER_SEQUENCE_TEXTS[0];
      }, TRIGGER_SEQUENCE_STEP_MS * 4),
      window.setTimeout(() => {
        dialog.textContent = TRIGGER_SEQUENCE_TEXTS[1];
      }, TRIGGER_SEQUENCE_STEP_MS * 5),
      window.setTimeout(() => {
        dialog.textContent = TRIGGER_SEQUENCE_TEXTS[2];
      }, TRIGGER_SEQUENCE_STEP_MS * 6),
      window.setTimeout(() => {
        dialog.textContent = TRIGGER_SEQUENCE_TEXTS[3];
      }, TRIGGER_SEQUENCE_STEP_MS * 7),
      window.setTimeout(() => {
        dialog.classList.remove('visible');
        far.style.display = 'none';
        ending.style.display = 'flex';
        createTriggerEndingText(endingText, 'Зацепил...');
        endingText.classList.add('visible');
        const blinkTimer = window.setInterval(() => {
          endingText.classList.toggle('visible');
        }, TRIGGER_SEQUENCE_BLINK_MS);
        triggerSequenceTimers.push(blinkTimer);
      }, TRIGGER_SEQUENCE_STEP_MS * 8)
    );
  }

  function isTriggerHit(event) {
    if (!currentClickTrigger) {
      return false;
    }

    const refs = getModalElements();
    const point = refs?.image
      ? pointerToImagePixel(refs.image, event.clientX, event.clientY)
      : null;

    return Boolean(
      point &&
      isRedTriggerPixel(currentClickTrigger, point.x, point.y)
    );
  }

  function updateLens(event) {
    const refs = getModalElements();

    if (!refs?.image || !refs.lens || !lensActive) {
      return;
    }

    const rect = refs.image.getBoundingClientRect();
    const naturalWidth = refs.image.naturalWidth;
    const naturalHeight = refs.image.naturalHeight;

    if (!naturalWidth || !naturalHeight || !rect.width || !rect.height) {
      return;
    }

    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const renderWidth = naturalWidth * scale;
    const renderHeight = naturalHeight * scale;
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;
    const x = Math.max(0, Math.min(naturalWidth, (event.clientX - rect.left - offsetX) / scale));
    const y = Math.max(0, Math.min(naturalHeight, (event.clientY - rect.top - offsetY) / scale));
    const renderX = offsetX + x * scale;
    const renderY = offsetY + y * scale;
    const lensSize = refs.lens.getBoundingClientRect().width;

    refs.lens.style.left = `${event.clientX - lensSize / 2}px`;
    refs.lens.style.top = `${event.clientY - lensSize / 2}px`;
    refs.lens.style.backgroundImage = `url("${refs.image.currentSrc || refs.image.src}")`;
    refs.lens.style.backgroundSize = `${renderWidth * lensZoom}px ${renderHeight * lensZoom}px`;
    refs.lens.style.backgroundPosition = `${lensSize / 2 - renderX * lensZoom}px ${lensSize / 2 - renderY * lensZoom}px`;
  }

  function startLens(event) {
    const refs = getModalElements();

    if (!refs?.image || event.button !== 0 || triggerSequenceRunning || isTriggerHit(event)) {
      return;
    }

    lensActive = true;
    lensZoom = 3;
    refs.lens.classList.add('active');
    updateLens(event);
    event.preventDefault();
  }

  function stopLens() {
    lensActive = false;
    const refs = getModalElements();
    refs?.lens?.classList.remove('active');
  }

  function zoomLens(event) {
    if (!lensActive) {
      return;
    }

    event.preventDefault();
    lensZoom = Math.max(1, Math.min(12, lensZoom * Math.exp(-event.deltaY * 0.001)));
    updateLens(event);
  }

  function closeImageModal() {
    const refs = getModalElements();

    if (!refs || triggerSequenceRunning) {
      return;
    }

    stopLens();

    if (closeModalTimer) {
      clearTimeout(closeModalTimer);
      closeModalTimer = null;
    }

    refs.modal.classList.remove('open');
    refs.modal.setAttribute('aria-hidden', 'true');

    document.body.classList.remove('modal-open');

    if (currentCardArt) {
      currentCardArt.classList.remove('examining');
    }

    currentClickTrigger = null;
    refs.image.classList.remove('hot', 'trigger-hot');

    closeModalTimer = window.setTimeout(() => {
      if (refs.modal.classList.contains('open')) {
        return;
      }

      refs.modal.hidden = true;
      refs.modal.classList.remove('blackout');
      refs.image.src = '';
      refs.image.alt = '';
      closeModalTimer = null;
    }, MODAL_TRANSITION_MS);
  }

  async function openImageModal(
    src,
    alt,
    cardShadow = false,
    blackout = false,
    sourceCard = null,
    clickTrigger = null
  ) {
    const refs = getModalElements();

    if (!refs) {
      return;
    }

    if (closeModalTimer) {
      clearTimeout(closeModalTimer);
      closeModalTimer = null;
    }

    currentCardArt = sourceCard || null;
    currentClickTrigger = clickTrigger || null;
    refs.image.classList.remove('hot');

    refs.modal.hidden = false;
    refs.modal.setAttribute('aria-hidden', 'false');
    refs.modal.classList.remove('open');
    refs.modal.classList.toggle('blackout', Boolean(blackout));

    refs.image.src = src;
    refs.image.alt = alt || '';
    refs.image.style.filter = cardShadow
      ? 'drop-shadow(0 18px 60px rgba(0, 0, 0, 0.55))'
      : 'none';

    document.body.classList.add('modal-open');

    await waitForImage(refs.image);
    await nextFrame();

    refs.modal.classList.add('open');

    if (currentCardArt) {
      currentCardArt.classList.add('examining');
    }
  }

  function buildAnimatedNickname(nickname) {
    return Array.from(String(nickname ?? ''))
      .map(ch => {
        const safe =
          ch === ' '
            ? '&nbsp;'
            : escapeHtml(ch);

        return `<span class="nickname-letter">${safe}</span>`;
      })
      .join('');
  }

  function clearIntroTimers() {
    introTimers.forEach(clearTimeout);
    introTimers = [];
  }

  function animateNickname() {
    const nickname = document.querySelector('.nickname');

    if (!nickname) {
      return;
    }

    const letters = Array.from(
      nickname.querySelectorAll('.nickname-letter')
    );

    letters.forEach((letter, index) => {
      letter
        .getAnimations()
        .forEach(animation => animation.cancel());

      const y = -80 - ((index * 17) % 140);
      const rotate = -18 + ((index * 19) % 36);
      const delay = index * 35 + (index % 5) * 18;

      letter.animate(
        [
          {
            opacity: 0,
            transform: `translateY(${y}px) rotate(${rotate}deg)`
          },
          {
            opacity: 1,
            transform: 'translateY(0) rotate(0deg)'
          }
        ],
        {
          duration: 900 + (index % 7) * 45,
          delay,
          easing: 'cubic-bezier(.2,.9,.25,1)',
          fill: 'forwards'
        }
      );
    });
  }

  function restartLayoutIntro() {
    clearIntroTimers();

    const layout = document.querySelector('.profile-layout');
    const left = document.querySelector('.left-col');
    const center = document.querySelector('.center-col');
    const right = document.querySelector('.right-col');

    if (!layout || !left || !center || !right) {
      return;
    }

    left.classList.remove('in');
    center.classList.remove('in');
    right.classList.remove('in');

    void layout.offsetWidth;

    requestAnimationFrame(() => {
      const leftTimer = window.setTimeout(
        () => left.classList.add('in'),
        20
      );

      const centerTimer = window.setTimeout(() => {
        center.classList.add('in');
        animateNickname();
      }, 140);

      const rightTimer = window.setTimeout(
        () => right.classList.add('in'),
        260
      );

      introTimers.push(
        leftTimer,
        centerTimer,
        rightTimer
      );
    });
  }

  function buildSocialButtons(socialMedia) {
    const entries =
      socialMedia &&
      typeof socialMedia === 'object'
        ? Object.entries(socialMedia)
        : [];

    if (!entries.length) {
      return '<div class="social-empty">Социальных сетей нет.</div>';
    }

    return entries
      .map(([, social]) => {
        const name = normalizeText(
          social?.name,
          'Ссылка'
        );

        const link = normalizeText(
          social?.link,
          '#'
        );

        const iconUrl = resolveIconUrl(
          social?.icon
        );

        if (iconUrl) {
          const id =
            `mask-${Math.random().toString(36).slice(2, 10)}`;

          return `
            <a
              class="social-link"
              href="${escapeAttribute(link)}"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="${escapeAttribute(name)}"
            >
              <span
                class="social-icon-wrap"
                aria-hidden="true"
              >
                <svg
                  class="social-icon"
                  viewBox="0 0 32 32"
                  focusable="false"
                  aria-hidden="true"
                >
                  <defs>
                    <mask id="${id}">
                      <image
                        href="${escapeAttribute(iconUrl)}"
                        width="32"
                        height="32"
                        preserveAspectRatio="xMidYMid meet"
                      ></image>
                    </mask>
                  </defs>

                  <rect
                    width="32"
                    height="32"
                    fill="currentColor"
                    mask="url(#${id})"
                  ></rect>
                </svg>
              </span>

              <span class="social-name">
                ${escapeHtml(name)}
              </span>
            </a>
          `;
        }

        return `
          <a
            class="social-link"
            href="${escapeAttribute(link)}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${escapeAttribute(name)}"
          >
            <span
              class="social-icon-wrap fallback"
              aria-hidden="true"
            >•</span>

            <span class="social-name">
              ${escapeHtml(name)}
            </span>
          </a>
        `;
      })
      .join('');
  }

  function renderCharacter(folder, info) {
    currentFolder = normalizeText(folder);
    currentInfo =
      info && typeof info === 'object'
        ? info
        : null;

    const nickname = normalizeText(
      info?.nickname,
      folder
    );

    const status = normalizeText(
      info?.status,
      ''
    );

    const description = normalizeText(
      info?.description,
      ''
    );

    const isOnline = Boolean(info?.online);

    const uuid =
      info?.uuid != null
        ? String(info.uuid)
        : '';

    const cardUrl = cacheBustedUrl(
      `${characterRoot}/${encodeURIComponent(folder)}/card.png`
    );

    const cardExamineUrl = cacheBustedUrl(
      `${characterRoot}/${encodeURIComponent(folder)}/card_examine.png`
    );

    let portraitUrl;

    if (isOnline) {
      if (uuid) {
        portraitUrl = getVisageUrl(uuid);
      } else {
        console.warn(
          `У персонажа "${nickname}" установлено online=true, ` +
          `но в info.json отсутствует uuid.`
        );

        portraitUrl = cacheBustedUrl(
          `${characterRoot}/${encodeURIComponent(folder)}/skin.png`
        );
      }
    } else {
      portraitUrl = cacheBustedUrl(
        `${characterRoot}/${encodeURIComponent(folder)}/skin.png`
      );
    }

    if (isOnline) {
      console.log(
        `Visage URL для "${nickname}":`,
        portraitUrl
      );
    }

    const interactionPromise = loadInteractionState(currentFolder);

    content.className = 'profile-layout';

    content.innerHTML = `
      <aside class="left-col media-col">
        <img
          class="portrait"
          src="${escapeAttribute(portraitUrl)}"
          alt="${escapeAttribute(nickname)}"
          draggable="false"
          style="filter: ${info?.card_shadow === true ? 'drop-shadow(0 10px 34px rgba(0,0,0,0.45))' : 'none'};"
        >
      </aside>

      <section class="center-col">
        <h1 class="nickname">
          ${buildAnimatedNickname(nickname)}
        </h1>

        <div class="detail-block">
          <div class="detail-line">
            <span class="detail-label">Статус:</span>
            ${formatText(status, '—')}
          </div>

          <div class="detail-line">
            <span class="detail-label">О себе:</span>
            ${formatText(description, '—')}
          </div>

          <div class="detail-title">
            Социальные сети:
          </div>

          <div class="social-list">
            ${buildSocialButtons(info?.social_media)}
          </div>
        </div>
      </section>

      <aside class="right-col media-col">
        <img
          class="character-card-art"
          src="${escapeAttribute(cardUrl)}"
          alt="${escapeAttribute(nickname)}"
          draggable="false"
          style="filter: ${info?.card_shadow === true ? 'drop-shadow(0 10px 34px rgba(0,0,0,0.45))' : 'none'};"
        >

        <div class="card-author">
          Художник карточки:
          ${formatText(
            normalizeText(info?.card_author, '—'),
            '—'
          )}
        </div>
      </aside>
    `;

    const portraitImg =
      content.querySelector('.portrait');

    if (portraitImg && isOnline && uuid) {

      loadPortraitFresh(portraitImg, getVisageUrl(uuid));
    }

    const cardArt =
      content.querySelector('.character-card-art');

    if (cardArt) {
      const openCardImage = () => {
        if (cardArt.classList.contains('examining')) {
          return;
        }

        const loadAndOpen = ({ blackout, clickTrigger }) => {
          const examine = new Image();
          examine.onload = () => {
            openImageModal(
              cardExamineUrl,
              `${nickname} — карточка`,
              info?.card_shadow === true,
              blackout,
              cardArt,
              clickTrigger
            );
          };
          examine.onerror = () => {
            openImageModal(
              cardUrl,
              `${nickname} — карточка`,
              info?.card_shadow === true,
              blackout,
              cardArt,
              clickTrigger
            );
          };
          examine.src = cardExamineUrl;
        };

        interactionPromise
          .then(loadAndOpen)
          .catch(() => loadAndOpen({ blackout: false, clickTrigger: null }));
      };

      cardArt.addEventListener(
        'click',
        openCardImage
      );

      cardArt.addEventListener(
        'keydown',
        event => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();

            openCardImage();
          }
        }
      );

      cardArt.setAttribute(
        'tabindex',
        '0'
      );

      cardArt.setAttribute(
        'role',
        'button'
      );

      cardArt.setAttribute(
        'aria-label',
        'Открыть карточку на весь экран'
      );
    }

    restartLayoutIntro();
  }

  function renderNotFound() {
    content.className = 'empty';
    content.textContent = 'Персонаж не найден.';
  }

  async function bootstrap() {
    if (!content) {
      return;
    }

    const folders = await loadFolders();

    if (!folders.length) {
      renderNotFound();
      return;
    }

    const requestedFolder =
      getFolderFromQuery();

    const folder =
      requestedFolder || folders[0];

    if (!folders.includes(folder)) {
      renderNotFound();
      return;
    }

    const info = await loadInfo(folder);

    renderCharacter(folder, info);
  }

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const refs = getModalElements();

      if (refs) {
        if (refs.closeButton) {
          refs.closeButton.addEventListener(
            'click',
            closeImageModal
          );
        }

        refs.modal.addEventListener(
          'click',
          event => {
            if (
              event.target === refs.modal ||
              event.target.classList.contains('image-modal__backdrop')
            ) {
              closeImageModal();
            }
          }
        );

        document.addEventListener(
          'keydown',
          event => {
            if (event.key === 'Escape') {
              closeImageModal();
            }
          }
        );

        refs.image.addEventListener('mousemove', event => {
          const hit = isTriggerHit(event);
          refs.image.classList.toggle('hot', hit);
          refs.image.classList.toggle('trigger-hot', hit);

          if (lensActive) {
            updateLens(event);
          }
        });

        refs.image.addEventListener('mouseleave', () => {
          refs.image.classList.remove('hot', 'trigger-hot');
          stopLens();
        });

        refs.image.addEventListener('mousedown', startLens);
        refs.image.addEventListener('wheel', zoomLens, { passive: false });
        window.addEventListener('mouseup', stopLens);

        refs.image.addEventListener('click', event => {
          if (!isTriggerHit(event)) {
            return;
          }

          event.stopPropagation();
          document.dispatchEvent(
            new CustomEvent('character-click-trigger', {
              detail: { folder: currentFolder }
            })
          );
        });

        document.addEventListener('character-click-trigger', startTriggerSequence);
      }

      bootstrap().catch(error => {
        console.error(
          'Failed to load character:',
          error
        );

        renderNotFound();
      });
    }
  );

  window.addEventListener(
    'pageshow',
    event => {
      closeImageModal();

      if (
        event.persisted &&
        currentFolder
      ) {
        renderCharacter(
          currentFolder,
          currentInfo
        );

        return;
      }

      if (
        content &&
        content.classList.contains(
          'profile-layout'
        )
      ) {
        restartLayoutIntro();
      }
    }
  );
})();