(() => {
  const characterRoot = 'assets/characters';
  const charactersListPath = `${characterRoot}/characters.json`;
  const iconRoot = 'assets/images/social_media_icons';
  const nickListPath = `${characterRoot}/nick_list.txt`;
  const charactersContainer = document.getElementById('characters-container');
  const nickPanel = document.getElementById('nick-panel');
  const nickPanelToggle = document.getElementById('nick-panel-toggle');
  const nickPanelBackdrop = document.getElementById('nick-panel-backdrop');
  const nickSearch = document.getElementById('nick-search');
  const nickList = document.getElementById('nick-list');
  const nickTotal = document.getElementById('nick-total');
  const cardToast = document.getElementById('card-toast');
  const cardsPerRow = 4;
  const DEFAULT_PRIORITY = 999;
  const LEAVE_PRIORITY = 'leave';
  const LEAVE_TITLE = 'Ушедшие';
  const NO_CARD_MESSAGE = 'У пользователя отсутствует карточка';
  const TOAST_VISIBLE_MS = 2600;

  let introTimers = [];
  let cardIndex = new Map();
  let socialIndex = new Map();
  let toastTimer = null;
  let scrollFrame = 0;
  let card_image_observer = null;
  let card_image_queue = [];
  let card_image_queue_timer = null;

  const normalizeText = (value, fallback = '') => String(value ?? '').trim() || fallback;


  function extractFolders(payload) {
    if (Array.isArray(payload)) {
      return payload
        .map(item => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
        .filter(Boolean);
    }
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.folders)) return extractFolders(payload.folders);
      if (Array.isArray(payload.characters)) return extractFolders(payload.characters);
    }
    return [];
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }

  function readSocials(value) {
    if (!value || typeof value !== 'object') return [];

    return Object.values(value)
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        name: normalizeText(item.name, 'Ссылка'),
        link: normalizeText(item.link, '#'),
        icon: normalizeText(item.icon),
      }));
  }

  function resolveIconUrl(icon) {
    if (!icon) return '';
    if (/\.[a-z0-9]+$/i.test(icon)) return `${iconRoot}/${icon.replace(/\.png$/i, '.webp')}`;
    return `${iconRoot}/${icon}.webp`;
  }

  function createSocialIcon(social) {
    const iconUrl = resolveIconUrl(social.icon);

    if (!iconUrl) {
      const dot = document.createElement('span');
      dot.textContent = '•';
      return dot;
    }

    const icon = document.createElement('img');
    icon.src = iconUrl;
    icon.alt = '';
    icon.draggable = false;
    icon.decoding = 'async';
    return icon;
  }

  function createSocialBar(socials) {
    if (!socials.length) return null;

    const bar = document.createElement('div');
    bar.className = 'card-socials';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Социальные сети');

    socials.forEach(social => {
      const link = document.createElement('a');
      link.className = 'card-social';
      link.href = social.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.draggable = false;
      link.setAttribute('aria-label', social.name);
      link.appendChild(createSocialIcon(social));
      bar.appendChild(link);
    });

    return bar;
  }

  function readPriority(value) {
    if (normalizeKey(value) === LEAVE_PRIORITY) return LEAVE_PRIORITY;
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PRIORITY;
  }

  async function loadFolders() {
    try {
      const response = await fetch(charactersListPath, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return extractFolders(data);
    } catch (error) {
      console.error('Не удалось прочитать characters.json:', error);
      return [];
    }
  }

  async function loadNicks() {
    try {
      const response = await fetch(nickListPath, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    } catch (error) {
      console.error('Не удалось прочитать nick_list.txt:', error);
      return [];
    }
  }

  async function loadCharacter(folder) {
    const safeFolder = normalizeText(folder);
    if (!safeFolder) return null;

    try {
      const response = await fetch(`${characterRoot}/${encodeURIComponent(safeFolder)}/info.json`, { cache: 'no-store' });
      if (!response.ok) {
        return { folder: safeFolder, nickname: safeFolder, priority: DEFAULT_PRIORITY, socials: [] };
      }

      const data = await response.json();
      return {
        folder: safeFolder,
        nickname: normalizeText(data?.nickname, safeFolder),
        priority: readPriority(data?.priority),
        cardShadow: data?.card_shadow === true,
        socials: readSocials(data?.social_media),
      };
    } catch (error) {
      console.warn(`Не удалось прочитать info.json для папки ${safeFolder}:`, error);
      return { folder: safeFolder, nickname: safeFolder, priority: DEFAULT_PRIORITY, socials: [] };
    }
  }

  function createCharacterCard(character) {
    const folder = String(character.folder);
    const nickname = normalizeText(character.nickname, folder);
    const cardShadow = character.cardShadow === true;

    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.folder = folder;

    const link = document.createElement('a');
    link.className = 'character-card-link';
    link.href = `profile.html?id=${encodeURIComponent(folder)}`;
    link.draggable = false;
    link.setAttribute('aria-label', nickname);

    const img = document.createElement('img');
    img.decoding = 'async';
    img.alt = nickname;
    img.draggable = false;
    img.loading = 'lazy';
    img.style.filter = cardShadow ? 'drop-shadow(0 8px 30px rgba(0,0,0,0.45))' : 'none';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = nickname;

    link.append(img, label);
    card.appendChild(link);

    const socialBar = createSocialBar(character.socials ?? []);
    if (socialBar) card.appendChild(socialBar);

    img.dataset.src = `${characterRoot}/${encodeURIComponent(folder)}/card400.webp`;
    return card;
  }


  function load_card_image(img) {
    const image_url = img.dataset.src;
    if (!image_url || img.dataset.loaded === 'true') return;

    img.src = image_url;
    img.dataset.loaded = 'true';
    delete img.dataset.src;
  }

  function process_card_image_queue() {
    if (card_image_queue_timer || !card_image_queue.length) return;

    const img = card_image_queue.shift();
    load_card_image(img);
    card_image_queue_timer = setTimeout(() => {
      card_image_queue_timer = null;
      process_card_image_queue();
    }, 120);
  }

  function queue_card_image(img) {
    if (!img.dataset.src || card_image_queue.includes(img)) return;
    card_image_queue.push(img);
    process_card_image_queue();
  }

  function setup_card_image_loading() {
    card_image_observer?.disconnect();
    card_image_observer = null;
    card_image_queue = [];
    clearTimeout(card_image_queue_timer);
    card_image_queue_timer = null;

    const images = Array.from(charactersContainer.querySelectorAll('.character-card-link img[data-src]'));
    const visible_images = images.filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    });

    visible_images.forEach(load_card_image);

    const remaining_images = images.filter(img => img.dataset.src);
    if (!remaining_images.length) return;

    if (!('IntersectionObserver' in window)) {
      remaining_images.forEach(queue_card_image);
      return;
    }

    card_image_observer = new IntersectionObserver(entries => {
      entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach(entry => {
          card_image_observer.unobserve(entry.target);
          queue_card_image(entry.target);
        });
    }, { rootMargin: '120px 0px' });

    remaining_images.forEach(img => card_image_observer.observe(img));
  }

  function clearIntroTimers() {
    introTimers.forEach(clearTimeout);
    introTimers = [];
  }

  function restartCardsIntro() {
    if (!charactersContainer) return;

    const cards = Array.from(charactersContainer.querySelectorAll('.character-card'));
    if (!cards.length) return;

    clearIntroTimers();
    cards.forEach(card => card.classList.remove('in'));
    void charactersContainer.offsetWidth;

    const sections = Array.from(charactersContainer.querySelectorAll('.priority-section'));
    let delay = 0;

    sections.forEach(section => {
      const sectionCards = Array.from(section.querySelectorAll('.character-card'));
      sectionCards.forEach(card => {
        const timer = setTimeout(() => card.classList.add('in'), delay);
        introTimers.push(timer);
        delay += 100;
      });
      delay += 180;
    });
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function registerCard(character, card) {
    const socials = character.socials ?? [];
    const folderKey = normalizeKey(character.folder);
    const nicknameKey = normalizeKey(character.nickname);

    cardIndex.set(folderKey, card);
    socialIndex.set(folderKey, socials);

    if (!cardIndex.has(nicknameKey)) {
      cardIndex.set(nicknameKey, card);
      socialIndex.set(nicknameKey, socials);
    }
  }

  function pulseCard(card) {
    charactersContainer.querySelectorAll('.character-card').forEach(otherCard => {
      otherCard.classList.remove('pulse');
      otherCard.classList.toggle('dimmed', otherCard !== card);
    });
    void card.offsetWidth;
    card.classList.add('pulse');
  }

  function scrollToCard(card, onDone) {
    const rect = card.getBoundingClientRect();
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const start = window.scrollY;
    const target = Math.max(0, Math.min(maxScroll, start + rect.top - (window.innerHeight - rect.height) / 2));
    const distance = target - start;
    if (Math.abs(distance) < 2) {
      onDone?.();
      return;
    }

    const duration = Math.min(1100, 450 + Math.abs(distance) * 0.35);
    let startTime = 0;

    cancelAnimationFrame(scrollFrame);

    function step(now) {
      if (!startTime) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, start + distance * easeInOut(progress));
      if (progress < 1) scrollFrame = requestAnimationFrame(step);
      else onDone?.();
    }

    scrollFrame = requestAnimationFrame(step);
  }

  function showToast(message) {
    cardToast.textContent = message;
    cardToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => cardToast.classList.remove('show'), TOAST_VISIBLE_MS);
  }

  function setPanelOpen(open) {
    nickPanel.classList.toggle('open', open);
    nickPanelBackdrop.classList.toggle('open', open);
    nickPanelToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nick-panel-open', open);
  }

  function selectNick(nick) {
    const card = cardIndex.get(normalizeKey(nick));
    setPanelOpen(false);

    if (!card) {
      showToast(NO_CARD_MESSAGE);
      return;
    }

    scrollToCard(card, () => pulseCard(card));
  }

  function filterNicks() {
    const query = normalizeKey(nickSearch.value);
    nickList.querySelectorAll('.nick-item').forEach(item => {
      item.hidden = Boolean(query) && !normalizeKey(item.dataset.nick).includes(query);
    });
  }

  function renderNickList(nicks) {
    nickList.replaceChildren();

    nicks.forEach(nick => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'nick-item';
      item.dataset.nick = nick;

      const name = document.createElement('span');
      name.className = 'nick-item__name';
      name.textContent = `・${nick}`;
      item.appendChild(name);

      const socials = socialIndex.get(normalizeKey(nick)) ?? [];
      if (socials.length) {
        const icons = document.createElement('span');
        icons.className = 'nick-item__icons';
        socials.forEach(social => icons.appendChild(createSocialIcon(social)));
        item.appendChild(icons);
      }

      nickList.appendChild(item);
    });

    nickTotal.textContent = `В сумме ${nicks.length}`;
    filterNicks();
    requestAnimationFrame(() => nickPanel.classList.add('in'));
  }

  function setupNickPanel() {
    if (!nickPanel || !nickPanelToggle || !nickPanelBackdrop || !nickSearch || !nickList || !nickTotal || !cardToast) return;

    nickList.addEventListener('click', event => {
      const item = event.target.closest('.nick-item');
      if (item) selectNick(item.dataset.nick);
    });

    charactersContainer.addEventListener('animationend', event => {
      if (event.animationName !== 'card-pulse') return;
      const card = event.target.closest('.character-card');
      if (!card?.classList.contains('pulse')) return;
      card.classList.remove('pulse');
      charactersContainer.querySelectorAll('.character-card.dimmed').forEach(otherCard => otherCard.classList.remove('dimmed'));
    });

    nickSearch.addEventListener('input', filterNicks);
    nickPanelToggle.addEventListener('click', () => setPanelOpen(!nickPanel.classList.contains('open')));
    nickPanelBackdrop.addEventListener('click', () => setPanelOpen(false));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setPanelOpen(false);
      else cancelAnimationFrame(scrollFrame);
    });

    ['wheel', 'touchstart'].forEach(name => {
      window.addEventListener(name, () => cancelAnimationFrame(scrollFrame), { passive: true });
    });
  }

  function setupCardSocials() {
    charactersContainer.addEventListener('wheel', event => {
      const bar = event.target.closest?.('.card-socials');
      if (!bar || bar.scrollWidth <= bar.clientWidth) return;
      event.preventDefault();
      bar.scrollLeft += event.deltaY || event.deltaX;
    }, { passive: false });
  }

  function renderCharacters(characters) {
    charactersContainer.innerHTML = '';
    cardIndex = new Map();
    socialIndex = new Map();

    if (!characters.length) {
      const empty = document.createElement('div');
      empty.className = 'characters-empty';
      empty.textContent = 'Персонажи не найдены.';
      charactersContainer.appendChild(empty);
      return;
    }

    const grouped = new Map();
    for (const character of characters) {
      const priority = character.priority ?? DEFAULT_PRIORITY;
      if (!grouped.has(priority)) grouped.set(priority, []);
      grouped.get(priority).push(character);
    }

    const priorities = [...grouped.keys()].sort((a, b) => {
      if (a === LEAVE_PRIORITY) return 1;
      if (b === LEAVE_PRIORITY) return -1;
      return a - b;
    });

    for (const priority of priorities) {
      const section = document.createElement('section');
      section.className = 'priority-section';
      section.dataset.priority = String(priority);

      if (priority === LEAVE_PRIORITY) {
        const title = document.createElement('div');
        title.className = 'priority-title';
        title.textContent = LEAVE_TITLE;
        section.appendChild(title);
      }

      const groupCharacters = grouped.get(priority)
        .slice()
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru', { numeric: true, sensitivity: 'base' }));

      let row = document.createElement('div');
      row.className = 'characters-row';
      section.appendChild(row);

      groupCharacters.forEach((character, index) => {
        if (index > 0 && index % cardsPerRow === 0) {
          row = document.createElement('div');
          row.className = 'characters-row';
          section.appendChild(row);
        }
        const card = createCharacterCard(character);
        registerCard(character, card);
        row.appendChild(card);
      });

      charactersContainer.appendChild(section);
    }

    requestAnimationFrame(() => {
      setup_card_image_loading();
      restartCardsIntro();
    });
  }

  async function bootstrap() {
    if (!charactersContainer) return;

    const nicksPromise = loadNicks();
    const folders = await loadFolders();

    if (folders.length) {
      const characters = await Promise.all(folders.map(loadCharacter));
      renderCharacters(characters.filter(Boolean));
    } else {
      renderCharacters([]);
    }

    if (nickList) renderNickList(await nicksPromise);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupNickPanel();
    if (charactersContainer) setupCardSocials();
    bootstrap().catch(error => {
      console.error('Failed to load characters:', error);
      renderCharacters([]);
    });
  });

  window.addEventListener('pageshow', () => {
    restartCardsIntro();
  });
})();
