// Connects the page's controls to pixelate() from pixelate.js.

const PALETTES = {
  blackWhite: ['#000000', '#ffffff'],
  green: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
          '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
};

const $ = id => document.getElementById(id);
let image = null;  // the picture the user picked
let result = null; // the small pixel-art canvas

// "#ff8800" -> [255, 136, 0]
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function update() {
  $('widthValue').textContent = $('width').value;
  $('colorsValue').textContent = $('colors').value;
  const preset = PALETTES[$('palette').value];
  $('colors').disabled = Boolean(preset); // presets have a fixed number of colours
  if (!image) return;

  result = pixelate(image, +$('width').value, +$('colors').value,
                    preset && preset.map(hexToRgb), $('dither').checked);
  $('output').replaceChildren(result);
  $('download').disabled = false;
}

function load(src) {
  const img = new Image();
  img.onload = () => { image = img; update(); };
  img.src = src;
}

// Saves the result 8 times bigger
function download() {
  const big = document.createElement('canvas');
  big.width = result.width * 8;
  big.height = result.height * 8;
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(result, 0, 0, big.width, big.height);

  const link = document.createElement('a');
  link.download = 'pixel-art.png';
  link.href = big.toDataURL();
  link.click();
}

$('controls').oninput = update;
$('file').onchange = event => load(URL.createObjectURL(event.target.files[0]));
$('sample').onclick = () => load('sample.png');
$('download').onclick = download;

document.ondragover = event => event.preventDefault();
document.ondrop = event => {
  event.preventDefault();
  load(URL.createObjectURL(event.dataTransfer.files[0]));
};
