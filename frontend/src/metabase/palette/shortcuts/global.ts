import { t } from "ttag";

import type { ShortcutDef } from "../types";
export const globalShortcuts: Record<string, ShortcutDef> = {
  "create-question": {
    name: "Create a question",
    shortcut: ["q"],
    shortcutGroup: "global",
  },
  "create-native-query": {
    name: "Create a native query",
    shortcut: ["n"],
    shortcutGroup: "global",
  },
  "create-dashboard": {
    name: "Create a dashboard",
    shortcut: ["d"],
    shortcutGroup: "global",
  },
  "create-collection": {
    name: "Create a collection",
    shortcut: ["c"],
    shortcutGroup: "global",
  },
  "create-model": {
    name: "Create a model",
    shortcut: ["m"],
    shortcutGroup: "global",
  },
  "create-metric": {
    name: "Create a metric",
    shortcut: ["k"],
    shortcutGroup: "global",
  },
  "browse-database": {
    name: "Browse databases",
    shortcut: ["b d"],
    shortcutGroup: "global",
  },
  "browse-model": {
    name: "Browse models",
    shortcut: ["b m"],
    shortcutGroup: "global",
  },
  "browse-metric": {
    name: "Browse metrics",
    shortcut: ["b k"],
    shortcutGroup: "global",
  },

  "report-issue": {
    name: t`Report an issue`,
    shortcut: ["$mod+f1"],
    shortcutGroup: "global",
  },
  "shortcuts-modal": {
    name: "Toggle Shortcuts Modal",
    shortcut: ["?"],
    shortcutGroup: "global",
  },
};
