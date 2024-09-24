import { aliases, colors } from "metabase/lib/colors";
import { checkNumber } from "metabase/lib/types";
import type {
  ColorGetter,
  RenderingContext,
} from "metabase/visualizations/types";

const ACCENT_KEY_PREFIX = "accent";

function getAccentNumberFromHex(hexColor: string) {
  const hexToAccentNumber = new Map<string, number>();

  for (const [key, hex] of Object.entries(colors)) {
    if (!key.startsWith(ACCENT_KEY_PREFIX)) {
      continue;
    }

    const accentNumber = checkNumber(
      Number(key.slice(ACCENT_KEY_PREFIX.length)),
    );

    hexToAccentNumber.set(hex, accentNumber);
  }

  for (const [key, hexGetter] of Object.entries(aliases)) {
    if (!key.startsWith(ACCENT_KEY_PREFIX)) {
      continue;
    }

    const accentNumber = checkNumber(
      Number(key.slice(ACCENT_KEY_PREFIX.length, ACCENT_KEY_PREFIX.length + 1)),
    );
    const hex = hexGetter(colors);

    hexToAccentNumber.set(hex, accentNumber);
  }

  return hexToAccentNumber.get(hexColor);
}

export function getColorForRing(
  hexColor: string,
  ring: "inner" | "middle" | "outer",
  hasMultipleRings: boolean,
  renderingContext: RenderingContext,
) {
  if (!hasMultipleRings) {
    return hexColor;
  }

  const accentNumber = getAccentNumberFromHex(hexColor);
  if (accentNumber == null) {
    return hexColor;
  }

  let suffix = "";
  if (ring === "inner") {
    suffix = "-dark";
  } else if (ring === "outer") {
    suffix = "-light";
  }

  return renderingContext.getColor(
    `${ACCENT_KEY_PREFIX}${accentNumber}${suffix}`,
  );
}

export function getColorForPicker(
  hexColor: string | undefined,
  hasMultipleRings: boolean,
  getColor: ColorGetter,
) {
  if (!hasMultipleRings || hexColor == null) {
    return hexColor;
  }

  const accentNumber = getAccentNumberFromHex(hexColor);
  if (accentNumber == null) {
    return hexColor;
  }

  return getColor(`${ACCENT_KEY_PREFIX}${accentNumber}-dark`);
}
