/*
 * Pixelate — the image-processing core. Plain algorithms, no AI:
 *   1. Area-average downscale (each output pixel = mean of the source block it covers)
 *   2. Brightness / contrast / saturation adjustments
 *   3. Palette: median-cut + k-means refinement, or a fixed preset palette
 *   4. Mapping to the palette with optional Floyd–Steinberg or Bayer ordered dithering
 */
const Pixelate = (() => {
  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  // "Redmean" weighted RGB distance: cheap and noticeably closer to human perception than plain RGB.
  function dist(r1, g1, b1, r2, g2, b2) {
    const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
  }

  function nearestIndex(pal, r, g, b) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i];
      const d = dist(r, g, b, p[0], p[1], p[2]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Box-filter downscale. Colour is alpha-weighted so transparent edges don't bleed dark fringes.
  function downscale(src, w, h) {
    const sw = src.width, sh = src.height, s = src.data;
    const out = new Float32Array(w * h * 4);
    const xs = new Int32Array(w + 1), ys = new Int32Array(h + 1);
    for (let x = 0; x <= w; x++) xs[x] = Math.round((x * sw) / w);
    for (let y = 0; y <= h; y++) ys[y] = Math.round((y * sh) / h);

    for (let ty = 0; ty < h; ty++) {
      const y0 = Math.min(ys[ty], sh - 1), y1 = Math.min(Math.max(ys[ty + 1], y0 + 1), sh);
      for (let tx = 0; tx < w; tx++) {
        const x0 = Math.min(xs[tx], sw - 1), x1 = Math.min(Math.max(xs[tx + 1], x0 + 1), sw);
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          let i = (y * sw + x0) * 4;
          for (let x = x0; x < x1; x++, i += 4) {
            const al = s[i + 3];
            r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; a += al; n++;
          }
        }
        const o = (ty * w + tx) * 4;
        if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
        out[o + 3] = n ? a / n : 0;
      }
    }
    return out;
  }

  function adjust(px, { brightness = 0, contrast = 0, saturation = 0 }) {
    if (!brightness && !contrast && !saturation) return;
    const bOff = brightness * 1.28;
    const c = contrast * 2.55;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const sf = 1 + saturation / 100;
    for (let i = 0; i < px.length; i += 4) {
      let r = cf * (px[i] - 128) + 128 + bOff;
      let g = cf * (px[i + 1] - 128) + 128 + bOff;
      let b = cf * (px[i + 2] - 128) + 128 + bOff;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      px[i] = clamp(l + (r - l) * sf);
      px[i + 1] = clamp(l + (g - l) * sf);
      px[i + 2] = clamp(l + (b - l) * sf);
    }
  }

  function mean(pts) {
    let r = 0, g = 0, b = 0;
    for (const p of pts) { r += p[0]; g += p[1]; b += p[2]; }
    const n = pts.length || 1;
    return [r / n, g / n, b / n];
  }

  // Median cut: repeatedly split the box with the widest colour spread at its median.
  function medianCut(pts, k) {
    const boxes = [pts];
    while (boxes.length < k) {
      let best = -1, bestScore = 0, bestCh = 0;
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (box.length < 2) continue;
        const lo = [255, 255, 255], hi = [0, 0, 0];
        for (const p of box) {
          for (let c = 0; c < 3; c++) {
            if (p[c] < lo[c]) lo[c] = p[c];
            if (p[c] > hi[c]) hi[c] = p[c];
          }
        }
        for (let c = 0; c < 3; c++) {
          const score = (hi[c] - lo[c]) * Math.sqrt(box.length);
          if (score > bestScore) { bestScore = score; best = i; bestCh = c; }
        }
      }
      if (best < 0) break; // every box is a single colour — image has fewer colours than k
      const sorted = boxes[best].slice().sort((p, q) => p[bestCh] - q[bestCh]);
      const mid = sorted.length >> 1;
      boxes.splice(best, 1, sorted.slice(0, mid), sorted.slice(mid));
    }
    return boxes.map(mean);
  }

  // A few rounds of k-means (Lloyd's algorithm) to pull median-cut colours onto real clusters.
  function refine(pts, pal, iters = 6) {
    const k = pal.length;
    for (let it = 0; it < iters; it++) {
      const sum = new Float64Array(k * 3), cnt = new Uint32Array(k);
      for (const p of pts) {
        const j = nearestIndex(pal, p[0], p[1], p[2]);
        sum[j * 3] += p[0]; sum[j * 3 + 1] += p[1]; sum[j * 3 + 2] += p[2]; cnt[j]++;
      }
      let moved = 0;
      for (let j = 0; j < k; j++) {
        if (!cnt[j]) continue;
        const n = [sum[j * 3] / cnt[j], sum[j * 3 + 1] / cnt[j], sum[j * 3 + 2] / cnt[j]];
        moved += Math.abs(n[0] - pal[j][0]) + Math.abs(n[1] - pal[j][1]) + Math.abs(n[2] - pal[j][2]);
        pal[j] = n;
      }
      if (moved < 1) break;
    }
    return pal;
  }

  function buildPalette(px, k) {
    const total = px.length / 4;
    const stride = Math.max(1, Math.floor(total / 20000)); // sample to keep slider drags snappy
    const pts = [];
    for (let i = 0; i < total; i += stride) {
      const o = i * 4;
      if (px[o + 3] >= 128) pts.push([px[o], px[o + 1], px[o + 2]]);
    }
    if (!pts.length) return [[0, 0, 0]];
    const pal = refine(pts, medianCut(pts, k));
    const seen = new Set();
    return pal
      .map(c => c.map(v => Math.round(clamp(v))))
      .filter(c => {
        const key = (c[0] << 16) | (c[1] << 8) | c[2];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function quantize(px, w, h, pal, dither, strength, out) {
    const cache = new Map();
    const counts = new Uint32Array(pal.length);
    const pick = (r, g, b) => {
      r = Math.round(clamp(r)); g = Math.round(clamp(g)); b = Math.round(clamp(b));
      const key = (r << 16) | (g << 8) | b;
      let j = cache.get(key);
      if (j === undefined) { j = nearestIndex(pal, r, g, b); cache.set(key, j); }
      return j;
    };
    const put = (i, j) => {
      const p = pal[j], o = i * 4;
      out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = 255;
      counts[j]++;
    };

    if (dither === 'fs') {
      const buf = Float32Array.from(px);
      for (let y = 0; y < h; y++) {
        const ltr = (y & 1) === 0; // serpentine scan avoids directional streaks
        for (let n = 0; n < w; n++) {
          const x = ltr ? n : w - 1 - n, dir = ltr ? 1 : -1;
          const i = y * w + x, o = i * 4;
          if (buf[o + 3] < 128) continue; // stays transparent
          const r = clamp(buf[o]), g = clamp(buf[o + 1]), b = clamp(buf[o + 2]);
          const j = pick(r, g, b);
          put(i, j);
          const p = pal[j];
          const er = (r - p[0]) * strength, eg = (g - p[1]) * strength, eb = (b - p[2]) * strength;
          const spread = (xx, yy, f) => {
            if (xx < 0 || xx >= w || yy >= h) return;
            const q = (yy * w + xx) * 4;
            if (buf[q + 3] < 128) return;
            buf[q] += er * f; buf[q + 1] += eg * f; buf[q + 2] += eb * f;
          };
          spread(x + dir, y, 7 / 16);
          spread(x - dir, y + 1, 3 / 16);
          spread(x, y + 1, 5 / 16);
          spread(x + dir, y + 1, 1 / 16);
        }
      }
    } else {
      const amp = dither === 'bayer' ? (strength * 255) / Math.cbrt(pal.length) : 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, o = i * 4;
          if (px[o + 3] < 128) continue;
          const t = amp ? ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * amp : 0;
          put(i, pick(px[o] + t, px[o + 1] + t, px[o + 2] + t));
        }
      }
    }

    return pal
      .map((c, j) => ({ color: c, count: counts[j] }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * @param {ImageData} src
   * @param {{width:number, colors:number, palette?:number[][], dither:'none'|'fs'|'bayer',
   *          ditherStrength:number, brightness:number, contrast:number, saturation:number}} o
   */
  function run(src, o) {
    const w = Math.max(1, Math.round(o.width));
    const h = Math.max(1, Math.round((src.height * w) / src.width));
    const px = downscale(src, w, h);
    adjust(px, o);
    const pal = o.palette && o.palette.length ? o.palette : buildPalette(px, o.colors);
    const image = new ImageData(w, h);
    const used = quantize(px, w, h, pal, o.dither, o.ditherStrength, image.data);
    return { image, palette: used };
  }

  function parseHexList(text) {
    const out = [];
    for (const m of text.matchAll(/#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      let hex = m[1];
      if (hex.length === 3) hex = hex.replace(/./g, ch => ch + ch);
      const n = parseInt(hex, 16);
      out.push([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
    return out;
  }

  const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

  return { run, parseHexList, toHex };
})();
