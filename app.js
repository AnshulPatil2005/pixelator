(() => {
  const $ = id => document.getElementById(id);

  const PALETTES = {
    '1bit': ['#000000', '#ffffff'],
    gray4: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    green4: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
            '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    sweetie16: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
                '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  };

  const MAX_SOURCE = 1024; // big photos are pre-shrunk to this; pixel art never needs more
  const els = {
    file: $('file'), drop: $('drop'), sample: $('sample'),
    width: $('width'), colors: $('colors'), palette: $('palette'), custom: $('custom'),
    dither: $('dither'), strength: $('strength'),
    brightness: $('brightness'), contrast: $('contrast'), saturation: $('saturation'), reset: $('reset'),
    grid: $('grid'), compare: $('compare'), scale: $('scale'), download: $('download'),
    stage: $('stage'), views: document.querySelector('.views'), out: $('out'), info: $('info'),
    original: $('original'), originalFig: $('originalFig'), outFig: $('outFig'),
    empty: $('empty'), swatches: $('swatches'), toast: $('toast'),
  };

  let source = null;  // { pixels: ImageData, name }
  let result = null;  // { image: ImageData, palette }
  const small = document.createElement('canvas'); // result at true size

  // ---------- loading ----------

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { toast('That file is not an image'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => useImage(img, url, file.name.replace(/\.[^.]+$/, '') || 'image');
    img.onerror = () => toast('Could not read that image');
    img.src = url;
  }

  function useImage(img, url, name) {
    const k = Math.min(1, MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    source = { pixels: ctx.getImageData(0, 0, w, h), name };

    if (els.original.src.startsWith('blob:')) URL.revokeObjectURL(els.original.src);
    els.original.src = url;
    els.width.max = Math.min(256, w);
    if (+els.width.value > w) els.width.value = w;
    els.empty.hidden = true;
    els.outFig.hidden = false;
    els.download.disabled = false;
    syncLabels();
    schedule();
  }

  function makeSample() {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 320;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 220);
    sky.addColorStop(0, '#2b3a8f'); sky.addColorStop(0.55, '#e76f8a'); sky.addColorStop(1, '#ffc46b');
    g.fillStyle = sky; g.fillRect(0, 0, 480, 320);
    g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(330, 170, 46, 0, Math.PI * 2); g.fill();
    const ridge = (color, base, amp, freq, phase) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, 320);
      for (let x = 0; x <= 480; x += 4) g.lineTo(x, base - amp * Math.abs(Math.sin(x * freq + phase)) - amp * 0.3 * Math.sin(x * freq * 3.1));
      g.lineTo(480, 320); g.fill();
    };
    ridge('#6b3b6e', 215, 70, 0.011, 0.6);
    ridge('#3d2853', 245, 50, 0.017, 2.1);
    const sea = g.createLinearGradient(0, 245, 0, 320);
    sea.addColorStop(0, '#1d4f73'); sea.addColorStop(1, '#0c2235');
    g.fillStyle = sea; g.fillRect(0, 250, 480, 70);
    g.fillStyle = 'rgba(255,230,160,.55)';
    for (let y = 258; y < 320; y += 7) g.fillRect(330 - (y - 240) * 0.6, y, (y - 240) * 1.2, 2);
    // a little palm tree
    g.strokeStyle = '#1a1020'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(95, 320); g.quadraticCurveTo(80, 230, 120, 170); g.stroke();
    g.fillStyle = '#1a1020';
    for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) {
      g.beginPath(); g.ellipse(120 + Math.cos(a) * 34, 170 + Math.sin(a) * 18, 40, 9, a, 0, Math.PI * 2); g.fill();
    }
    const img = new Image();
    img.onload = () => useImage(img, img.src, 'sample');
    img.src = c.toDataURL();
  }

  // ---------- processing ----------

  let queued = false;
  function schedule() {
    if (queued || !source) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; process(); });
  }

  function currentPalette() {
    const v = els.palette.value;
    if (v === 'auto') return null;
    const list = v === 'custom' ? Pixelate.parseHexList(els.custom.value)
                                : PALETTES[v].map(h => Pixelate.parseHexList(h)[0]);
    return list.length ? list : null;
  }

  function process() {
    result = Pixelate.run(source.pixels, {
      width: +els.width.value,
      colors: +els.colors.value,
      palette: currentPalette(),
      dither: els.dither.value,
      ditherStrength: +els.strength.value / 100,
      brightness: +els.brightness.value,
      contrast: +els.contrast.value,
      saturation: +els.saturation.value,
    });
    const { image } = result;
    small.width = image.width; small.height = image.height;
    small.getContext('2d').putImageData(image, 0, 0);
    els.info.textContent = `${image.width} × ${image.height} px · ${result.palette.length} colours`;
    render();
    renderSwatches();
  }

  // Draw at the largest whole-number scale that fits, in device pixels, so every art pixel is a crisp square.
  function render() {
    if (!result) return;
    const { width: w, height: h } = result.image;
    const dpr = window.devicePixelRatio || 1;
    const compare = els.compare.checked;
    const narrow = matchMedia('(max-width: 760px)').matches;
    let aw = els.views.clientWidth, ah = els.views.clientHeight - 28; // leave room for caption
    if (compare) { if (narrow) ah = ah / 2 - 20; else aw = aw / 2 - 10; }
    const ps = Math.max(1, Math.floor(Math.min((aw * dpr) / w, (ah * dpr) / h)));

    const c = els.out;
    c.width = w * ps; c.height = h * ps;
    c.style.width = `${c.width / dpr}px`;
    c.style.height = `${c.height / dpr}px`;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(small, 0, 0, c.width, c.height);

    if (els.grid.checked && ps >= 4) {
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      for (let x = 1; x < w; x++) ctx.fillRect(x * ps, 0, 1, c.height);
      for (let y = 1; y < h; y++) ctx.fillRect(0, y * ps, c.width, 1);
    }

    els.originalFig.hidden = !compare;
    if (compare) {
      els.original.style.width = c.style.width;
      els.original.style.height = c.style.height;
    }
  }

  function renderSwatches() {
    els.swatches.replaceChildren(...result.palette.map(({ color, count }) => {
      const hex = Pixelate.toHex(color);
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = hex;
      b.title = `${hex} · ${count} px`;
      b.onclick = () => navigator.clipboard?.writeText(hex).then(() => toast(`Copied ${hex}`), () => toast(hex));
      return b;
    }));
  }

  // ---------- export ----------

  function download() {
    if (!result) return;
    const s = +els.scale.value;
    const c = document.createElement('canvas');
    c.width = small.width * s; c.height = small.height * s;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, c.width, c.height);
    c.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${source.name}-pixel-${small.width}x${small.height}${s > 1 ? `@${s}x` : ''}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  // ---------- UI wiring ----------

  function syncLabels() {
    $('widthOut').textContent = `${els.width.value} px`;
    $('colorsOut').textContent = els.colors.value;
    $('strengthOut').textContent = `${els.strength.value}%`;
    for (const k of ['brightness', 'contrast', 'saturation']) $(`${k}Out`).textContent = els[k].value;
    $('colorsRow').hidden = els.palette.value !== 'auto';
    $('customRow').hidden = els.palette.value !== 'custom';
    $('strengthRow').hidden = els.dither.value === 'none';
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1600);
  }

  for (const el of [els.width, els.colors, els.palette, els.custom, els.dither, els.strength,
                    els.brightness, els.contrast, els.saturation]) {
    el.addEventListener('input', () => { syncLabels(); schedule(); });
  }
  els.grid.addEventListener('change', render);
  els.compare.addEventListener('change', render);
  els.reset.addEventListener('click', () => {
    els.brightness.value = els.contrast.value = els.saturation.value = 0;
    syncLabels(); schedule();
  });
  els.download.addEventListener('click', download);
  els.sample.addEventListener('click', makeSample);
  els.file.addEventListener('change', () => loadFile(els.file.files[0]));
  els.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); } });

  window.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    loadFile(e.dataTransfer.files[0]);
  });
  window.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });
  new ResizeObserver(render).observe(els.views);

  syncLabels();
})();
