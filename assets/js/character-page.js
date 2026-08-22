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

    return {
      modal,
      closeButton,
      image,
      panel
    };
  }

  let closeModalTimer = null;

  function closeImageModal() {
    const refs = getModalElements();

    if (!refs) {
      return;
    }

    if (closeModalTimer) {
      clearTimeout(closeModalTimer);
      closeModalTimer = null;
    }

    refs.modal.classList.remove('open');
    refs.modal.setAttribute('aria-hidden', 'true');
    refs.image.style.opacity = '0';

    document.body.classList.remove('modal-open');

    closeModalTimer = window.setTimeout(() => {
      if (refs.modal.classList.contains('open')) {
        return;
      }

      refs.modal.hidden = true;
      refs.image.src = '';
      refs.image.alt = '';
      closeModalTimer = null;
    }, 240);
  }

  async function openImageModal(src, alt) {
    const refs = getModalElements();

    if (!refs) {
      return;
    }

    if (closeModalTimer) {
      clearTimeout(closeModalTimer);
      closeModalTimer = null;
    }

    refs.modal.hidden = false;
    refs.modal.setAttribute('aria-hidden', 'false');
    refs.modal.classList.remove('open');

    refs.image.style.opacity = '0';
    refs.image.src = src;
    refs.image.alt = alt || '';

    document.body.classList.add('modal-open');

    await waitForImage(refs.image);
    await nextFrame();

    refs.modal.classList.add('open');
    refs.image.style.opacity = '1';
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

    content.className = 'profile-layout';

    content.innerHTML = `
      <aside class="left-col media-col">
        <img
          class="portrait"
          src="${escapeAttribute(portraitUrl)}"
          alt="${escapeAttribute(nickname)}"
          draggable="false"
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

    const cardArt =
      content.querySelector('.character-card-art');

    if (cardArt) {
      cardArt.addEventListener(
        'click',
        () =>
          openImageModal(
            cardUrl,
            `${nickname} — карточка`
          )
      );

      cardArt.addEventListener(
        'keydown',
        event => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();

            openImageModal(
              cardUrl,
              `${nickname} — карточка`
            );
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
            if (event.target === refs.modal) {
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