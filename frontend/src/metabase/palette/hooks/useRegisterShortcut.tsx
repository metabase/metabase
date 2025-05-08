import { type ActionImpl, KBarContext, useRegisterActions } from "kbar";
import { type DependencyList, useContext } from "react";

import { trackSimpleEvent } from "metabase/lib/analytics";

import { type KeyboardShortcutId, shortcuts } from "../shortcuts";
import type { ShortcutAction } from "../types";

export type RegisterShortcutProps = {
  id: KeyboardShortcutId;
  perform: (action: ActionImpl, event?: KeyboardEvent) => void;
} & Partial<ShortcutAction>;

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

        return {
          ...shortcutDef,
          id,
          perform: (action: ActionImpl, event?: KeyboardEvent) => {
            perform(action, event);
            if (event) {
              trackSimpleEvent({
                event: "keyboard_shortcut_performed",
                event_detail: id,
              });
            }
          },
          ...rest,
        };
      })
    : [];

  useRegisterActions(actions, [...deps]);
};
