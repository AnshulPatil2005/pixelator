# Pixelator

Turn any image into pixel art in your browser. It uses no AI, no server and no libraries.

Try it: https://anshulpatil2005.github.io/pixelator/

## Run it locally

```bash
python -m http.server 5178
```

Then open http://localhost:5178. You can also open `index.html` directly. Uploading your own images works that way, but the "Try a sample" button needs the server.

## How it works

All of the image work happens in [`pixelate.js`](pixelate.js), in three steps:

1. **Shrink:** the image is drawn onto a tiny canvas, so the browser averages each block of pixels into one.
2. **Pick colours:** k-means finds the N colours that best match the image. You can also choose a preset palette instead.
3. **Repaint:** each pixel becomes its closest palette colour. With dithering on, the leftover colour difference is passed to neighbouring pixels (Floyd–Steinberg). The mix of dots then fakes shades the palette doesn't have.

[`app.js`](app.js) connects the controls to that function. The page scales the small result up with `image-rendering: pixelated`, so the pixels stay sharp.
