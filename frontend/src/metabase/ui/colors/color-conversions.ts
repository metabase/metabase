/*!
 * Adapted from color-convert (MIT).
 * Copyright (c) 2011-2016 Heather Arthur <fayearthur@gmail.com>.
 * Copyright (c) 2016-2021 Josh Junon <josh@junon.me>.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
type Channels = [number, number, number];

export function rgbToHsl([red, green, blue]: Channels): Channels {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  const lightness = (min + max) / 2;
  if (delta === 0) {
    return [0, 0, lightness * 100];
  }

  let hue;
  if (max === r) {
    hue = (g - b) / delta;
  } else if (max === g) {
    hue = 2 + (b - r) / delta;
  } else {
    hue = 4 + (r - g) / delta;
  }
  hue = Math.min(hue * 60, 360);
  const saturation = delta / (lightness <= 0.5 ? max + min : 2 - max - min);
  return [hue < 0 ? hue + 360 : hue, saturation * 100, lightness * 100];
}

export function hslToRgb([hue, saturation, lightness]: Channels): Channels {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  if (s === 0) {
    const gray = l * 255;
    return [gray, gray, gray];
  }

  const high = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const low = 2 * l - high;
  const channel = (offset: number) => {
    let position = h + offset / 3;
    if (position < 0) {
      position++;
    }
    if (position > 1) {
      position--;
    }

    if (6 * position < 1) {
      return (low + (high - low) * 6 * position) * 255;
    }
    if (2 * position < 1) {
      return high * 255;
    }
    if (3 * position < 2) {
      return (low + (high - low) * (2 / 3 - position) * 6) * 255;
    }
    return low * 255;
  };

  return [channel(1), channel(0), channel(-1)];
}

export function hwbToRgb([hue, whiteness, blackness]: Channels): Channels {
  const h = hue / 360;
  let white = whiteness / 100;
  let black = blackness / 100;
  const ratio = white + black;
  if (ratio > 1) {
    white /= ratio;
    black /= ratio;
  }

  const sector = Math.floor(6 * h);
  const fraction = 6 * h - sector;
  const high = (1 - black) * 255;
  const low = white * 255;
  const mid =
    (white + (sector % 2 ? 1 - fraction : fraction) * (1 - black - white)) *
    255;
  switch (sector) {
    case 1:
      return [mid, high, low];
    case 2:
      return [low, high, mid];
    case 3:
      return [low, mid, high];
    case 4:
      return [mid, low, high];
    case 5:
      return [high, low, mid];
    default:
      return [high, mid, low];
  }
}
