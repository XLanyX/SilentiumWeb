(() => {
  const characterRoot = 'assets/chatacters';
  const charactersListPath = `${characterRoot}/characters.json`;
  const charactersContainer = document.getElementById('characters-container');
  const cardsPerRow = 4;
  const DEFAULT_PRIORITY = 999;

  let introTimers = [];

  const normalizeText = (value, fallback = '') => String(value ?? '').trim() || fallback;

  function cacheBustedUrl(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${Date.now()}`;
  }

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

  function readPriority(value) {
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

  async function loadCharacter(folder) {
    const safeFolder = normalizeText(folder);
    if (!safeFolder) return null;

    try {
      const response = await fetch(`${characterRoot}/${encodeURIComponent(safeFolder)}/info.json`, { cache: 'no-store' });
      if (!response.ok) {
        return { folder: safeFolder, nickname: safeFolder, priority: DEFAULT_PRIORITY };
      }

      const data = await response.json();
      return {
        folder: safeFolder,
        nickname: normalizeText(data?.nickname, safeFolder),
        priority: readPriority(data?.priority),
      };
    } catch (error) {
      console.warn(`Не удалось прочитать info.json для папки ${safeFolder}:`, error);
      return { folder: safeFolder, nickname: safeFolder, priority: DEFAULT_PRIORITY };
    }
  }

  function createCharacterCard(character) {
    const folder = String(character.folder);
    const nickname = normalizeText(character.nickname, folder);

    const card = document.createElement('a');
    card.className = 'character-card';
    card.href = `profile.html?id=${encodeURIComponent(folder)}`;
    card.draggable = false;
    card.setAttribute('aria-label', nickname);

    const img = document.createElement('img');
    img.src = cacheBustedUrl(`${characterRoot}/${encodeURIComponent(folder)}/card.png`);
    img.alt = nickname;
    img.draggable = false;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = nickname;

    card.append(img, label);
    return card;
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

  function renderCharacters(characters) {
    charactersContainer.innerHTML = '';

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

    const priorities = [...grouped.keys()].sort((a, b) => a - b);

    for (const priority of priorities) {
      const section = document.createElement('section');
      section.className = 'priority-section';
      section.dataset.priority = String(priority);

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
        row.appendChild(createCharacterCard(character));
      });

      charactersContainer.appendChild(section);
    }

    requestAnimationFrame(() => restartCardsIntro());
  }

  async function bootstrap() {
    if (!charactersContainer) return;

    const folders = await loadFolders();
    if (!folders.length) {
      renderCharacters([]);
      return;
    }

    const characters = await Promise.all(folders.map(loadCharacter));
    renderCharacters(characters.filter(Boolean));
  }

  document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch(error => {
      console.error('Failed to load characters:', error);
      renderCharacters([]);
    });
  });

  window.addEventListener('pageshow', () => {
    restartCardsIntro();
  });
})();
