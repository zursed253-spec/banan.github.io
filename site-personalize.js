/* Lightweight, dependency-free Banan personalization. */
(() => {
  'use strict';
  const THEME_KEY = 'banan-theme';
  const STICKER_KEY = 'banan-stickers';
  const MAX_STICKERS = 3;
  const root = document.documentElement;
  const toggle = document.getElementById('decorToggle');
  const close = document.getElementById('decorClose');
  const panel = document.getElementById('decorPanel');
  const layer = document.getElementById('poopLayer');
  const choices = document.getElementById('poopChoices');
  const counter = document.getElementById('poopCounter');
  const clear = document.getElementById('poopClear');
  if (!toggle || !close || !panel || !layer || !choices || !counter || !clear) return;

  const patterns = {
    smile: {
      title: 'Весёлая',
      face: '<circle cx="48" cy="70" r="3.6"/><circle cx="70" cy="70" r="3.6"/><path d="M45 79 Q59 95 75 79 Q64 89 57 87 Q50 86 45 79Z" fill="#4a2418" stroke="#321b13" stroke-width="2.5" stroke-linejoin="round"/>',
      extra: '<path d="M18 38 Q8 27 17 15 M103 43 Q114 31 106 18" class="steam"/>'
    },
    wink: {
      title: 'Хитрая',
      face: '<path d="M43 70 Q48 66 53 70" fill="none" stroke="#321b13" stroke-width="4" stroke-linecap="round"/><circle cx="72" cy="69" r="3.8"/><path d="M48 83 Q59 88 72 81" fill="none" stroke="#321b13" stroke-width="3.6" stroke-linecap="round"/><path d="M57 84 Q58 96 66 93 Q70 88 67 83" fill="#ea818b" stroke="#321b13" stroke-width="2.5"/>',
      extra: '<path d="M19 40 L13 34 M95 33 L101 22 M11 48 L3 48" class="spark"/>'
    },
    sleepy: {
      title: 'Сонная',
      face: '<path d="M42 71 Q48 75 54 71 M65 71 Q71 75 77 71" fill="none" stroke="#321b13" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="60" cy="84" rx="5" ry="7" fill="#4a2418"/>',
      extra: '<text x="91" y="27" font-family="system-ui,sans-serif" font-size="21" font-weight="800" fill="#86645b">Z</text><text x="108" y="12" font-family="system-ui,sans-serif" font-size="13" font-weight="800" fill="#a78b81">z</text>'
    }
  };
  const icons = Object.keys(patterns);
  function poopSvg(kind) {
    const theme = patterns[kind] || patterns.smile;
    return '<svg class="poop-art" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path d="M18 99 C8 96 10 84 18 77 C25 70 34 67 43 65 C35 59 36 51 41 46 C44 42 51 40 55 37 C53 27 60 23 65 15 C66 23 73 29 78 32 C88 37 90 46 85 52 C98 57 100 67 94 73 C104 79 110 90 101 99 C90 111 30 111 18 99Z" fill="#96582f" stroke="#352119" stroke-width="4.3" stroke-linejoin="round"/>' +
      '<path d="M23 87 Q21 100 41 100 L86 100 Q98 100 97 89 Q90 101 57 100 Q30 101 23 87" fill="#b67643" opacity=".65"/>' +
      '<path d="M42 59 Q38 70 61 73 M74 38 Q81 48 72 54" fill="none" stroke="#61351f" stroke-width="4" stroke-linecap="round" opacity=".65"/>' +
      theme.face + theme.extra + '</svg>';
  }

  function getStored(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }
  function setStored(key, value) {
    try { localStorage.setItem(key, value); }
    catch { /* Private browsing can block storage. */ }
  }
  function themeSet(value) {
    const theme = value === 'dark' ? 'dark' : 'light';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#111a21' : '#f4f6f7');
    for (const button of document.querySelectorAll('[data-site-theme]')) {
      button.setAttribute('aria-pressed', button.dataset.siteTheme === theme ? 'true' : 'false');
    }
    setStored(THEME_KEY, theme);
  }

  const stickers = [];
  const stored = getStored(STICKER_KEY);
  if (stored) {
    try {
      const saved = JSON.parse(stored);
      if (Array.isArray(saved)) {
        for (const item of saved.slice(0, MAX_STICKERS)) {
          if (item && icons.includes(item.kind) &&
              typeof item.x === 'number' && Number.isFinite(item.x) &&
              typeof item.y === 'number' && Number.isFinite(item.y)) {
            stickers.push({
              id: String(item.id || Math.random()).slice(0, 60),
              kind: item.kind,
              x: Math.max(0.06, Math.min(0.94, item.x)),
              y: Math.max(0.08, Math.min(0.92, item.y))
            });
          }
        }
      }
    } catch { /* Ignore corrupt saved customization. */ }
  }
  function save() {
    setStored(STICKER_KEY, JSON.stringify(stickers));
  }
  function countUpdate() {
    counter.textContent = stickers.length + ' / ' + MAX_STICKERS;
    clear.disabled = stickers.length === 0;
    for (const button of choices.querySelectorAll('button')) {
      button.disabled = stickers.length >= MAX_STICKERS;
    }
  }
  function position(el, sticker) {
    el.style.left = (sticker.x * 100) + '%';
    el.style.top = (sticker.y * 100) + '%';
  }
  function render() {
    layer.replaceChildren();
    for (const sticker of stickers) {
      const el = document.createElement('div');
      el.className = 'poop-sticker';
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Какашка: ' + patterns[sticker.kind].title + '. Стрелками можно перемещать, Delete — убрать.');
      el.innerHTML = poopSvg(sticker.kind);
      position(el, sticker);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'poop-sticker-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Убрать какашку');
      remove.addEventListener('pointerdown', e => e.stopPropagation());
      remove.addEventListener('click', e => {
        e.stopPropagation();
        const index = stickers.indexOf(sticker);
        if (index !== -1) stickers.splice(index, 1);
        save(); render();
      });
      el.appendChild(remove);
      el.tabIndex = 0;
      el.addEventListener('keydown', e => {
        const shifts = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
        if (shifts[e.key]) {
          e.preventDefault();
          const [dx,dy] = shifts[e.key];
          const step = e.shiftKey ? 0.05 : 0.015;
          sticker.x = Math.max(0.07, Math.min(0.93, sticker.x + dx * step));
          sticker.y = Math.max(0.08, Math.min(0.92, sticker.y + dy * step));
          position(el, sticker); save();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const index = stickers.indexOf(sticker);
          if (index !== -1) stickers.splice(index, 1);
          save(); render();
        }
      });

      let start = null;
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target === remove) return;
        start = { pointer: e.pointerId, x: e.clientX, y: e.clientY,
          originX: sticker.x, originY: sticker.y };
        el.classList.add('dragging');
        try { el.setPointerCapture(e.pointerId); } catch { /* Optional on older browsers. */ }
        e.preventDefault();
      });
      el.addEventListener('pointermove', e => {
        if (!start || start.pointer !== e.pointerId) return;
        const viewportW = Math.max(1, window.innerWidth);
        const viewportH = Math.max(1, window.innerHeight);
        const padX = Math.min(0.18, 45 / viewportW);
        const padY = Math.min(0.18, 45 / viewportH);
        sticker.x = Math.max(padX, Math.min(1 - padX, start.originX + (e.clientX - start.x) / viewportW));
        sticker.y = Math.max(padY, Math.min(1 - padY, start.originY + (e.clientY - start.y) / viewportH));
        position(el, sticker);
      });
      const finish = e => {
        if (!start || start.pointer !== e.pointerId) return;
        start = null;
        el.classList.remove('dragging');
        save();
      };
      el.addEventListener('pointerup', finish);
      el.addEventListener('pointercancel', finish);
      layer.appendChild(el);
    }
    countUpdate();
  }
  function createSticker(kind) {
    if (!icons.includes(kind) || stickers.length >= MAX_STICKERS) return;
    const n = stickers.length;
    stickers.push({
      id: Date.now().toString(36) + '-' + String(Math.random()).slice(2, 8),
      kind,
      x: Math.min(0.78, 0.38 + n * 0.13),
      y: Math.min(0.77, 0.4 + n * 0.1)
    });
    save(); render();
  }
  for (const kind of icons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poop-choice';
    button.setAttribute('aria-label', 'Добавить: ' + patterns[kind].title);
    button.innerHTML = poopSvg(kind) + '<span>' + patterns[kind].title + '</span>';
    button.addEventListener('click', () => createSticker(kind));
    choices.appendChild(button);
  }
  clear.addEventListener('click', () => {
    stickers.length = 0;
    save(); render();
  });
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  close.addEventListener('click', () => setPanel(false));
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) setPanel(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) {
      setPanel(false);
      toggle.focus();
    }
  });
  for (const button of document.querySelectorAll('[data-site-theme]')) {
    button.addEventListener('click', () => themeSet(button.dataset.siteTheme));
  }
  themeSet(getStored(THEME_KEY) || root.dataset.theme);
  render();
})();
