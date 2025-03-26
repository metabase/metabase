import { useRegisterActions } from "kbar";
import type { DependencyList } from "react";

import { shortcuts } from "../shortcuts";
import type { ShortcutAction } from "../types";

type RegisterShortcutProps = {
  id: keyof typeof shortcuts;
  perform: () => void;
} & Partial<ShortcutAction>;

export const useRegisterShortcut = (
  shortcutsToRegister: RegisterShortcutProps[],
  deps: DependencyList = [],
) => {
  const actions = shortcutsToRegister.map(({ id, perform }) => {
    const shortcutDef = shortcuts[id];

    if (shortcutDef === undefined) {
      throw Error(`Unrecgonized shortcut id ${id}`);
    }

    return {
      ...shortcutDef,
      id,
      perform,
    };
  });

  useRegisterActions(actions, [...deps]);
};
