import { aliases, colors } from "metabase/lib/colors";

const ACCENT_KEY_PREFIX = "accent";

type AccentKey = string;

const isAccentColorKey = (key: string) => key.startsWith(ACCENT_KEY_PREFIX);

const extractAccentKey = (input: string): AccentKey => {
  const withoutPrefix = input.slice(ACCENT_KEY_PREFIX.length);
  return withoutPrefix.split("-")[0] ?? null;
};

export function createHexToAccentNumberMap() {
  const hexToAccentNumber = new Map<string, AccentKey>();

  for (const [colorKey, hex] of Object.entries(colors)) {
    if (!isAccentColorKey(colorKey)) {
      continue;
    }
    const accentKey = extractAccentKey(colorKey);
    if (accentKey) {
      hexToAccentNumber.set(hex, accentKey);
    }
  }

  for (const [colorKey, hexGetter] of Object.entries(aliases)) {
    if (!isAccentColorKey(colorKey)) {
      continue;
    }

    const accentKey = extractAccentKey(colorKey);
    if (accentKey) {
      hexToAccentNumber.set(hexGetter(colors), accentKey);
    }
  }

  return hexToAccentNumber;
}

export function getRingColorAlias(
  accentKey: AccentKey,
  ring: "inner" | "middle" | "outer",
) {
  let suffix = "";
  if (ring === "inner") {
    suffix = "-dark";
  } else if (ring === "outer") {
    suffix = "-light";
  }

  return `${ACCENT_KEY_PREFIX}${accentKey}${suffix}`;
}

export function getPickerColorAlias(accentKey: AccentKey) {
  return `${ACCENT_KEY_PREFIX}${accentKey}-dark`;
}
