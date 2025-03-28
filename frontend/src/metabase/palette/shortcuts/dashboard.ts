import type { ShortcutDef } from "../types";

export const dashboardShortcuts: Record<string, ShortcutDef> = {
  "bookmark-dashboard": {
    name: "Bookmark Dashboard",
    shortcut: ["o"],
    shortcutGroup: "dashboard",
  },
  "add-filter": {
    name: "Add Filter",
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-notebook-question": {
    name: "Add Notebook Question",
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-native-question": {
    name: "Add Native Question",
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "cancel-edit": {
    name: "Cancel Edit Dashboard",
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "copy-dashboard": {
    name: "Copy dashboard",
    shortcut: ["$mod+c"],
    shortcutGroup: "dashboard",
  },
  "move-dashboard": {
    name: "Move dashboard",
    shortcut: ["$mod+m"],
    shortcutGroup: "dashboard",
  },
  "trash-dashboard": {
    name: "Send tashboard to trash",
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
  },
  "info-dashboard": {
    name: "Toggle Dashboard Info",
    shortcut: ["]"],
    shortcutGroup: "dashboard",
  },
  "edit-dashboard": {
    name: "Edit Dashboard",
    shortcutGroup: "dashboard",
    shortcut: ["e"],
  },
  "save-dashboard": {
    name: "Save Dashboard",
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
};
