// Turns an image into pixel art in three steps:
//   1. Shrink it, so each pixel becomes one big "art pixel".
//   2. Pick a small palette of colours (unless one is given).
//   3. Repaint every pixel with the closest colour from that palette.
// Returns a small canvas holding the result.
function pixelate(image, width, colorCount, palette, dither) {
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Drawing the image smaller makes the browser average the pixels for us.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);

  // 2 + 3.
  palette = palette || findPalette(pixels.data, colorCount);
  repaint(pixels, palette, dither);

  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

// Finds the `count` colours that best represent the image, using k-means:
// start with colours spread from dark to light, then repeatedly move each
// colour to the average of the pixels that are closest to it.
function findPalette(data, count) {
  // Looking at about 5000 pixels is plenty, and keeps the sliders fast.
  const step = 4 * Math.ceil(data.length / 4 / 5000);
  const pixels = [];
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] > 127) pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [[0, 0, 0]];

  pixels.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let palette = [];
  for (let i = 0; i < count; i++) {
    palette.push(pixels[Math.floor(((i + 0.5) * pixels.length) / count)]);
  }

  for (let round = 0; round < 8; round++) {
    const sums = palette.map(() => [0, 0, 0, 0]); // red, green, blue, pixel count
    for (const pixel of pixels) {
      const sum = sums[closest(palette, pixel)];
      sum[0] += pixel[0];
      sum[1] += pixel[1];
      sum[2] += pixel[2];
      sum[3] += 1;
    }
    palette = sums.map(([r, g, b, n], i) => (n ? [r / n, g / n, b / n] : palette[i]));
  }
  return palette.map(color => color.map(Math.round));
}

// Returns the index of the palette colour nearest to `color`.
function closest(palette, color) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const distance = (color[0] - p[0]) ** 2 + (color[1] - p[1]) ** 2 + (color[2] - p[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

// Replaces every pixel with its closest palette colour. With dithering on, the
// difference between the old and new colour is passed on to the neighbouring
// pixels (Floyd–Steinberg), so mixed dots fake the shades the palette lacks.
function repaint({ data, width, height }, palette, dither) {
  const spread = (x, y, error, share) => {
    if (x < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) data[i + c] += error[c] * share;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) {
        data[i + 3] = 0; // mostly see-through pixels become fully transparent
        continue;
      }
      const old = [data[i], data[i + 1], data[i + 2]];
      const color = palette[closest(palette, old)];
      data.set([color[0], color[1], color[2], 255], i);

      if (dither) {
        const error = old.map((value, c) => value - color[c]);
        spread(x + 1, y, error, 7 / 16);
        spread(x - 1, y + 1, error, 3 / 16);
        spread(x, y + 1, error, 5 / 16);
        spread(x + 1, y + 1, error, 1 / 16);
      }
    }
  }
}
