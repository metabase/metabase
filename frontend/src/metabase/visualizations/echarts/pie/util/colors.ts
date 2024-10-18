import { aliases, colors } from "metabase/lib/colors";
import { checkNumber } from "metabase/lib/types";

const ACCENT_KEY_PREFIX = "accent";

export function createHexToAccentNumberMap() {
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

  return hexToAccentNumber;
}

export function getRingColorAlias(
  accentColorNumber: number,
  ring: "inner" | "middle" | "outer",
) {
  let suffix = "";
  if (ring === "inner") {
    suffix = "-dark";
  } else if (ring === "outer") {
    suffix = "-light";
  }

  return `${ACCENT_KEY_PREFIX}${accentColorNumber}${suffix}`;
}

export function getPickerColorAlias(accentNumber: number) {
  return `${ACCENT_KEY_PREFIX}${accentNumber}-dark`;
}
