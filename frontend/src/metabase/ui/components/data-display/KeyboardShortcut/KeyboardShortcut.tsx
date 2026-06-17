import { Group } from "@mantine/core";
import { Fragment } from "react";
import { t } from "ttag";

import { Kbd } from "../Kbd";

import S from "./KeyboardShortcut.module.css";
import { parseShortcut } from "./utils";

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
