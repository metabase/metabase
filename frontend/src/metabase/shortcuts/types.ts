import type { Action } from "kbar";

import type { GROUP_LABELS } from "./constants";

export type ShortcutGroup = keyof typeof GROUP_LABELS;

export type ShortcutAction = Action & {
  shortcut: string[];
  hide?: boolean;
  shortcutGroup: ShortcutGroup;
  shortcutContext?: string;
  shortcutDisplay?: string[];
  dynamic?: boolean;
};

export type ShortcutDef = Pick<
  ShortcutAction,
  | "id"
  | "name"
  | "hide"
  | "shortcut"
  | "shortcutGroup"
  | "shortcutContext"
  | "shortcutDisplay"
>;
