import colorString, { type Model } from "color-string";

import { hslToRgb, hwbToRgb, rgbToHsl } from "./color-conversions";

type ColorChannels = [number, number, number];

interface CssColor<M extends Model = Model> {
  model: M;
  channels: ColorChannels;
  alpha: number;
}

const clamp = (value: number, maximum: number) =>
  Math.min(maximum, Math.max(0, value));

const wrapHue = (hue: number) => ((hue % 360) + 360) % 360;

export function parseColor(input: string | null | undefined): CssColor {
  if (input === null || input === undefined) {
    return { model: "rgb", channels: [0, 0, 0], alpha: 1 };
  }
  const parsed = colorString.get(input);
  if (!parsed) {
    throw new Error(`Unable to parse color from string: ${input}`);
  }

  const {
    model,
    value: [first, second, third, alpha],
  } = parsed;
  const channels: ColorChannels = [
    model === "rgb" ? first : wrapHue(first),
    second,
    third,
  ];
  return { model, channels, alpha };
}

function rgb({ model, channels }: CssColor): ColorChannels {
  switch (model) {
    case "rgb":
      return channels;
    case "hsl":
      return hslToRgb(channels);
    case "hwb":
      return hwbToRgb(channels);
  }
}

export function toHsl(color: CssColor): CssColor<"hsl"> {
  const [hue, saturation, lightness] =
    color.model === "hsl" ? color.channels : rgbToHsl(rgb(color));
  return {
    model: "hsl",
    channels: [wrapHue(hue), clamp(saturation, 100), clamp(lightness, 100)],
    alpha: color.alpha,
  };
}

export function adjustLightness(
  color: CssColor,
  adjust: (lightness: number) => number,
): CssColor {
  const {
    channels: [hue, saturation, lightness],
    alpha,
  } = toHsl(color);
  return {
    model: "hsl",
    channels: [hue, saturation, clamp(adjust(lightness), 100)],
    alpha,
  };
}

export function toHex(color: CssColor): string {
  const [red, green, blue] = rgb(color);
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(clamp(channel, 255)).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

export function formatColor(color: CssColor, alpha = color.alpha): string {
  // Round channels before serializing, but leave alpha at full precision.
  const round = (value: number) => Number(value.toFixed(1));
  const [first, second, third] = color.channels.map(round);
  const opacity = clamp(alpha, 1);
  const suffix = opacity === 1 ? "" : `, ${opacity}`;

  switch (color.model) {
    case "rgb":
      return `rgb${suffix ? "a" : ""}(${Math.round(first)}, ${Math.round(second)}, ${Math.round(third)}${suffix})`;
    case "hsl":
      return `hsl${suffix ? "a" : ""}(${wrapHue(first)}, ${second}%, ${third}%${suffix})`;
    case "hwb":
      return `hwb(${wrapHue(first)}, ${second}%, ${third}%${suffix})`;
  }
}

export function isDarkColor(color: CssColor): boolean {
  const [red, green, blue] = rgb(color);
  return (red * 2126 + green * 7152 + blue * 722) / 10000 < 128;
}

export function luminance(color: CssColor): number {
  const [red, green, blue] = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
