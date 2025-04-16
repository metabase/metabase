import { KBarContext, useRegisterActions } from "kbar";
import { type DependencyList, useContext } from "react";

import { shortcuts } from "../shortcuts";
import type { ShortcutAction, ShortcutDef } from "../types";

export type RegisterShortcutProps = {
  shortcutId: keyof typeof shortcuts;
  id: string;
  perform: () => void;
  shortcut: string[];
} & Partial<ShortcutAction>;

// This hook is very similar to useRegisterShortcut, but is used in places where we need individual
// shortcuts based on the number of things on screen (like dashboard tabs). We point to a reference
// shortcut def, but a shortcut must be passed in to register

export const useRegisterDynamicShortcut = (
  shortcutsToRegister: RegisterShortcutProps[],
  deps: DependencyList = [],
) => {
  // In this hook, we check for kbar context, and if it is present, then we register shortcuts
  // If we pass an empty array to useRegisterActions, it will not try to access the
  // kbar context. This should keep unit tests happy without wrapping everything, as well as
  // embedding scenarios where buttons can use components that call this hook without any
  // side effects

  const ctx = useContext(KBarContext);

  const actions = ctx.query
    ? shortcutsToRegister.map(({ shortcutId, id, ...rest }) => {
        const shortcutDef = shortcuts[shortcutId] as ShortcutDef;

        if (shortcutDef === undefined) {
          throw Error(`Unrecgonized shortcut id ${id}`);
        }

        if (!shortcutDef.dynamic) {
          throw Error(
            `Shortcut is not defined as dynamic. Use useRegisterShortcut instead`,
          );
        }

        return {
          ...shortcutDef,
          id,
          ...rest,
        };
      })
    : [];

  useRegisterActions(actions, [...deps]);
};
