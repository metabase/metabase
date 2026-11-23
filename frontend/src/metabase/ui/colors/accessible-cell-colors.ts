import Color, { type ColorInstance } from "color";

import { getBaseColorsForThemeDefinitionOnly } from "./constants/base-colors";
import { getTextColorForBackground } from "./palette";
import { getSafeColor } from "./safe-color";

const MIN_TEXT_CONTRAST = 4.5;
const BASE_COLORS = getBaseColorsForThemeDefinitionOnly();

function composite(foreground: ColorInstance, background: ColorInstance) {
  return background
    .alpha(1)
    .mix(foreground.alpha(1), foreground.alpha())
    .round();
}

function getTextColor(background: ColorInstance) {
  const preferred = Color(
    getTextColorForBackground(background.string(), (value) => value),
  ).alpha(1);
  if (preferred.contrast(background) >= MIN_TEXT_CONTRAST) {
    return preferred.string();
  }
  const black = Color(BASE_COLORS.black);
  const white = Color(BASE_COLORS.white);
  return black.contrast(background) > white.contrast(background)
    ? black.string()
    : white.string();
}

/** Resolve a cell fill over its surface and choose opaque AA text for normal and hover states. */
export function getAccessibleCellColors(
  backgroundColor: string,
  surfaceColor: string,
  textColor: string,
) {
  let fill: ColorInstance;
  let surface: ColorInstance;
  let text: ColorInstance;
  try {
    fill = Color(getSafeColor(backgroundColor));
    surface = Color(surfaceColor);
    text = Color(textColor);
  } catch {
    // CSS expressions remain under the theme's control until they can be resolved.
    return undefined;
  }

  if (surface.alpha() < 1) {
    return undefined;
  }
  const background = composite(fill, surface);
  const darkFill = fill.isDark();
  const hoverFill = darkFill
    ? Color(BASE_COLORS.white)
    : Color(BASE_COLORS.black);
  const hoverAmount = darkFill ? 0.05 : 0.03;
  // CSS color-mix interpolates premultiplied sRGB. Composite first since
  // both the normal and hover fills are painted over the same surface.
  const hoverBackground = background.mix(hoverFill, hoverAmount).round();

  if (
    composite(text, background).contrast(background) >= MIN_TEXT_CONTRAST &&
    composite(text, hoverBackground).contrast(hoverBackground) >=
      MIN_TEXT_CONTRAST
  ) {
    return undefined;
  }

  return {
    backgroundColor: background.string(),
    color: getTextColor(background),
    hoverBackgroundColor: hoverBackground.string(),
    hoverColor: getTextColor(hoverBackground),
  };
}
