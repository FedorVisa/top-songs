const glyphs = ' .,:;il!|/\\trfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
const asciiStates = new WeakMap();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const num = n => String(n).padStart(2, '0');

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function paintGlyph(state, cell, glyphIndex = cell.glyph, clear = true) {
  const { ctx, dx, dy } = state;
  if (clear) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x * dx, cell.y * dy, dx, dy);
    ctx.clip();
    ctx.clearRect(cell.x * dx, cell.y * dy, dx, dy);
  }
  ctx.fillStyle = cell.color;
  ctx.fillText(glyphs[glyphIndex], (cell.x + .5) * dx, (cell.y + .53) * dy, dx * .98);
  if (clear) ctx.restore();
}

function drawDetailed(canvas, image) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cols = 142;
  const rows = 71;
  const dx = size / cols;
  const dy = size / rows;

  const sample = document.createElement('canvas');
  sample.width = cols;
  sample.height = rows;
  const sampleContext = sample.getContext('2d');
  sampleContext.drawImage(image, 0, 0, cols, rows);
  const pixels = sampleContext.getImageData(0, 0, cols, rows).data;

  ctx.clearRect(0, 0, size, size);
  ctx.font = `${dy * .93}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const state = { ctx, dx, dy, cells: [], changed: [] };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const offset = (y * cols + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const brightness = Math.pow((.2126 * r + .7152 * g + .0722 * b) / 255, .73);
      const glyph = Math.round(brightness * (glyphs.length - 1));
      if (!glyph) continue;

      const red = Math.min(255, Math.round(r * .97 + 27));
      const green = Math.min(255, Math.round(g * .97 + 27));
      const blue = Math.min(255, Math.round(b * .97 + 27));
      const alpha = Math.min(1, .78 + .23 * brightness);
      const cell = { x, y, glyph, color: `rgba(${red},${green},${blue},${alpha})` };
      state.cells.push(cell);
      paintGlyph(state, cell, glyph, false);
    }
  }
  asciiStates.set(canvas, state);
}

function restoreGlyphs(canvas) {
  const state = canvas && asciiStates.get(canvas);
  if (!state) return;
  for (const cell of state.changed) paintGlyph(state, cell);
  state.changed = [];
}

function createSlide(track, position, trackCount) {
  const section = make('section', 'slide');
  section.id = track.id;
  section.setAttribute('aria-label', `${position}. ${track.artist} — ${track.title}`);
  section.style.setProperty('--tone', track.accent);
  section.style.setProperty('--glow', track.glow);
  section.style.setProperty('--base', track.bg);

  const art = make('div', 'art');
  const canvas = make('canvas', 'ascii-cover');
  canvas.width = 1000;
  canvas.height = 1000;
  canvas.setAttribute('aria-hidden', 'true');

  const image = make('img', 'original-cover');
  image.alt = `Original cover — ${track.album}`;
  image.loading = trackCount <= 30 || position <= 2 ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.onload = () => {
    drawDetailed(canvas, image);
    canvas.dataset.ready = 'true';
  };
  image.src = track.cover;
  art.append(canvas, image);

  const content = make('div', 'content');
  const rank = make('p', 'rank', `Track ${num(position)} / ${num(trackCount)}`);
  const compact = track.title.length > 10 && track.lines.length === 1;
  const heading = make('h1', compact ? 'title compact' : 'title');
  for (const line of track.lines) heading.append(make('span', '', line));

  const artist = make('p', 'artist', track.artist);
  const album = make('div', 'album');
  const albumCopy = make('div', 'album-copy');
  albumCopy.append(make('small', '', 'Album'), make('b', '', track.album));
  album.append(albumCopy, make('span', 'year', String(track.year)));

  content.append(rank, heading, artist, album);
  section.append(art, content);
  return section;
}

function initializeDeck(tracks) {
  const deck = document.getElementById('deck');
  const nav = document.getElementById('dotnav');
  const current = document.getElementById('current');
  const progress = document.getElementById('progress');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');

  document.getElementById('total').textContent = num(tracks.length);
  document.getElementById('edition').textContent = `${num(tracks.length)} records / vol. 01`;
  nav.classList.toggle('dense', tracks.length > 15);

  let index = 0;
  let animatedCanvas = null;
  let animationFrame = 0;

  const sections = [];
  const dots = [];
  tracks.forEach((track, i) => {
    const position = i + 1;
    const section = createSlide(track, position, tracks.length);
    deck.append(section);
    sections.push(section);

    const dot = make('button', 'dot');
    dot.type = 'button';
    dot.setAttribute('aria-label', `${position}. ${track.title} — ${track.artist}`);
    dot.append(make('span', 'dot-label', `${num(position)} · ${track.title}`));
    dot.addEventListener('click', () => go(i));
    nav.append(dot);
    dots.push(dot);
  });

  function animateGlyphs() {
    if (document.hidden || reducedMotion.matches) {
      restoreGlyphs(animatedCanvas);
      return;
    }

    const canvas = sections[index]?.querySelector('.ascii-cover');
    const state = canvas && asciiStates.get(canvas);
    if (!state || !state.cells.length) return;
    if (animatedCanvas !== canvas) {
      restoreGlyphs(animatedCanvas);
      animatedCanvas = canvas;
    }
    restoreGlyphs(canvas);

    const touched = new Set();
    const count = Math.min(150, Math.ceil(state.cells.length * .018));
    for (let i = 0; i < count; i++) {
      const cell = state.cells[Math.floor(Math.random() * state.cells.length)];
      if (touched.has(cell)) continue;
      touched.add(cell);

      const delta = Math.random() < .5 ? -1 : 1;
      let glyph = Math.max(1, Math.min(glyphs.length - 1, cell.glyph + delta * (1 + Math.floor(Math.random() * 4))));
      if (glyph === cell.glyph) glyph = cell.glyph === 1 ? 2 : cell.glyph - 1;
      paintGlyph(state, cell, glyph);
      state.changed.push(cell);
    }
    canvas.dataset.frame = String(++animationFrame);
  }

  function activate(i) {
    if (i < 0 || i >= tracks.length) return;
    index = i;
    sections.forEach((section, j) => section.classList.toggle('active', i === j));
    dots.forEach((dot, j) => {
      dot.classList.toggle('active', i === j);
      if (i === j) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    current.textContent = num(i + 1);
    progress.style.width = `${(i + 1) / tracks.length * 100}%`;
    document.documentElement.style.setProperty('--accent', tracks[i].accent);
    prev.disabled = i === 0;
    next.disabled = i === tracks.length - 1;
    try {
      history.replaceState(null, '', `#${tracks[i].id}`);
    } catch {
      // Keep navigation usable when history is unavailable.
    }
  }

  function go(i, instant = false) {
    i = Math.max(0, Math.min(tracks.length - 1, i));
    deck.scrollTo({
      top: sections[i].offsetTop,
      behavior: instant || reducedMotion.matches ? 'instant' : 'smooth',
    });
    if (instant) activate(i);
  }

  let pending = false;
  deck.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      let nearest = 0;
      let bestDistance = Infinity;
      sections.forEach((section, i) => {
        const distance = Math.abs(section.offsetTop - deck.scrollTop);
        if (distance < bestDistance) {
          nearest = i;
          bestDistance = distance;
        }
      });
      if (nearest !== index) activate(nearest);
    });
  }, { passive: true });

  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));
  document.getElementById('home').addEventListener('click', event => {
    event.preventDefault();
    go(0);
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    let target;
    if (['ArrowDown', 'PageDown'].includes(event.key)) target = index + 1;
    else if (['ArrowUp', 'PageUp'].includes(event.key)) target = index - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tracks.length - 1;
    else return;
    event.preventDefault();
    go(target);
  });

  const start = tracks.findIndex(track => `#${track.id}` === location.hash);
  activate(Math.max(0, start));
  if (start > 0) requestAnimationFrame(() => go(start, true));
  window.addEventListener('resize', () => go(index, true));
  setInterval(animateGlyphs, 147);
}

async function loadTracks() {
  const response = await fetch(new URL('../data/tracks.json', import.meta.url));
  if (!response.ok) throw new Error(`Track data request failed with HTTP ${response.status}`);
  const tracks = await response.json();
  if (!Array.isArray(tracks) || !tracks.length) throw new Error('Track data is empty or invalid');
  return tracks;
}

loadTracks().then(initializeDeck).catch(error => {
  console.error(error);
  document.getElementById('load-error').hidden = false;
});
