import { ALTKEY, METAKEY } from "metabase/utils/browser";

const KEY_LABELS: Record<string, string> = {
  $mod: METAKEY,
  Alt: ALTKEY,
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const capitalize = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/** Normalize a single key token to its display label. */
export const formatKey = (key: string) => {
  if (KEY_LABELS[key]) {
    return KEY_LABELS[key];
  }
  // `KeyboardEvent.code` letter form, e.g. `KeyL` → `L`.
  const codeLetter = key.match(/^Key([A-Z])$/);
  if (codeLetter) {
    return codeLetter[1];
  }
  // Capitalize letters and named keys: `c` → `C`, `backspace` → `Backspace`.
  return capitalize(key);
};

// Canonical modifier order within a chord, so a shortcut renders consistently
// regardless of how it's written in the source.
const MODIFIER_ORDER = ["$mod", "Alt", "Shift"];

const modifierRank = (key: string) => {
  const index = MODIFIER_ORDER.indexOf(key);
  return index === -1 ? MODIFIER_ORDER.length : index;
};

/**
 * Parse a hotkeys-style string into sequential steps of simultaneous keys.
 * Whitespace separates steps pressed one after another; `+` joins keys pressed
 * together. e.g. `"$mod+k"` → `[["⌘", "K"]]`, `"c e"` → `[["C"], ["E"]]`. Keys
 * within a chord are ordered by `MODIFIER_ORDER` (the non-modifier key sorts
 * last; the sort is stable so other keys keep their original order).
 */
export const parseShortcut = (shortcut: string): string[][] =>
  shortcut
    .trim()
    .split(/\s+/)
    .map((step) =>
      step
        .split("+")
        .sort((a, b) => modifierRank(a) - modifierRank(b))
        .map(formatKey),
    );
