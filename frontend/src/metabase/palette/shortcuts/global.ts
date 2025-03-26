import { t } from "ttag";

// import type { ShortcutAction } from "../types";

// type ShortcutDef = Pick<ShortcutAction, "name" | "shortcut" | "shortcutGroup">;

export const globalShortcuts = {
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
    name: "create a model",
    shortcut: ["m"],
    shortcutGroup: "global",
  },
  "create-metric": {
    name: "Create a metric",
    shortcut: ["k"],
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
