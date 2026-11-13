"""Green-screen keying for the generated fighter art.
Usage: python3 key.py <in.webp> <out.webp>   (or import key_image)"""
import sys
import numpy as np
from PIL import Image, ImageFilter

def key_image(src, lo=45, hi=170):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)                      # how green a pixel is
    alpha = 1.0 - np.clip((d - lo) / (hi - lo), 0.0, 1.0)
    # hard-kill obvious background, keep solid interior
    alpha[d > hi] = 0.0
    # despill: pull green down to the larger of red/blue wherever it dominates
    spill = np.maximum(0.0, g - np.maximum(r, b))
    g2 = np.where(alpha < 1.0, g - spill, g - spill * 0.6)
    out = np.stack([r, np.minimum(g, np.maximum(g2, 0)), b], axis=-1)
    # tiny feather on the matte to avoid jagged edges
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    rgba = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')
    rgba.putalpha(al)
    return rgba

if __name__ == '__main__':
    key_image(sys.argv[1]).save(sys.argv[2], 'WEBP', quality=92, method=6)
