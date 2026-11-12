# Pixelator

Turn any image into pixel art in the browser, using classic image-processing algorithms (no AI, no server, no dependencies).

## Run

Open `index.html` in a browser (double-click it), or serve the folder:

```bash
python -m http.server 5178
```

then visit http://localhost:5178.

## How it works (`pixelate.js`)

1. **Downscale**: each output pixel is the alpha-weighted average of the block of source pixels it covers (a box filter). Transparent PNGs stay transparent.
2. **Adjust**: brightness, contrast and saturation are applied to the small image.
3. **Palette**:
   - *Auto*: median cut splits the colour space into N boxes, then a few rounds of k-means move each colour onto a real cluster centre.
   - *Presets / custom*: a fixed list of hex colours.
4. **Map to palette**: each pixel takes the nearest palette colour, measured by the "redmean" weighted RGB distance, which is closer to human perception than plain RGB distance.
   - *Floyd–Steinberg*: pushes each pixel's rounding error onto its neighbours, using a serpentine scan.
   - *Bayer*: adds a 4×4 threshold pattern before matching, giving the classic crosshatch look.
5. **Display / export**: the image is scaled up by whole numbers with nearest-neighbour sampling, so every art pixel stays a crisp square. You can download it at 1×, 4×, 8× or 16×.

## Files

- `index.html`: page markup and controls
- `style.css`: styling
- `pixelate.js`: the image-processing engine (pure functions, usable on its own)
- `app.js`: UI wiring (loading images, live preview, download)
