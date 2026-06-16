import { Group } from "@mantine/core";
import { Fragment } from "react";
import { t } from "ttag";

import { ALTKEY, METAKEY, SHIFTKEY } from "metabase/utils/browser";

import { Kbd } from "../Kbd";

import S from "./KeyboardShortcut.module.css";

const KEY_LABELS: Record<string, string> = {
  $mod: METAKEY,
  Alt: ALTKEY,
  Shift: SHIFTKEY,
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const capitalize = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

const formatKey = (key: string) => {
  if (KEY_LABELS[key]) {
    return KEY_LABELS[key];
  }
  // `KeyboardEvent.code` letter form, e.g. `KeyL` → `L`.
  const codeLetter = key.match(/^Key([A-Z])$/);
  if (codeLetter) {
    return codeLetter[1];
  }
  // Capitalize letters and named keys: `c` → `C`, `backspace` → `Backspace`
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
 * within a chord are sorted for stable order.
 */
const parseShortcut = (shortcut: string): string[][] =>
  shortcut
    .trim()
    .split(/\s+/)
    .map((step) =>
      step
        .split("+")
        .sort((a, b) => modifierRank(a) - modifierRank(b))
        .map(formatKey),
    );

export interface KeyboardShortcutProps {
  /** Hotkeys-style shortcut, e.g. `"$mod+k"` (simultaneous) or `"c e"` (sequential). */
  shortcut: string;
}

export function KeyboardShortcut({ shortcut }: KeyboardShortcutProps) {
  const steps = parseShortcut(shortcut);

  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      {steps.map((keys, stepIndex) => (
        <Fragment key={`${stepIndex}-${keys.join("+")}`}>
          {stepIndex > 0 && <span className={S.separator}>{t`then`}</span>}
          <Group gap="0.125rem" wrap="nowrap">
            {keys.map((key, keyIndex) => (
              <Kbd key={`${keyIndex}-${key}`}>{key}</Kbd>
            ))}
          </Group>
        </Fragment>
      ))}
    </Group>
  );
}
