import { type ActionImpl, KBarContext, useRegisterActions } from "kbar";
import { type DependencyList, useContext } from "react";

import { type KeyboardShortcutId, shortcuts } from "../shortcuts";
import type { ShortcutAction } from "../types";

import { trackKeyboardShortcutPerformed } from "./analytics";

export type RegisterShortcutProps = {
  id: KeyboardShortcutId;
  perform: (action: ActionImpl, event?: KeyboardEvent) => void;
} & Partial<ShortcutAction>;

/**
 * Combines `keywords` from the shortcut definition and the registration site,
 * and — when the registration overrides `name` — also includes the original
 * shortcut def name.
 */
export const composeKeywords = (
  shortcutDef: { name?: string; keywords?: string } | undefined,
  rest: { name?: string; keywords?: string },
): string => {
  const isNameOverridden =
    shortcutDef?.name !== undefined &&
    rest.name !== undefined &&
    rest.name !== shortcutDef.name;

  return [
    shortcutDef?.keywords,
    rest.keywords,
    isNameOverridden ? shortcutDef?.name : null,
  ]
    .filter(Boolean)
    .join(", ");
};

export const useRegisterShortcut = (
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
    ? shortcutsToRegister.map(({ id, perform, ...rest }) => {
        const shortcutDef = shortcuts[id];

        if (shortcutDef === undefined && !rest.shortcut) {
          throw Error(`Unrecognized shortcut id ${id}`);
        }

        const keywords = composeKeywords(shortcutDef, rest);

        return {
          ...shortcutDef,
          id,
          perform: (action: ActionImpl, event?: KeyboardEvent) => {
            perform(action, event);
            if (event) {
              trackKeyboardShortcutPerformed(id);
            }
          },
          ...rest,
          ...(keywords ? { keywords } : {}),
        };
      })
    : [];

  useRegisterActions(actions, [...deps]);
};
