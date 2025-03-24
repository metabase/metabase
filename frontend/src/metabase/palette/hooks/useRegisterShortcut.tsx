import { useRegisterActions } from "kbar";

import type { ShortcutAction } from "../types";

export const useRegisterShortcut = (
  actions: ShortcutAction[],
  deps: any[] = [],
) => {
  useRegisterActions(actions, [...deps]);
};
