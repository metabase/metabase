import { t } from "ttag";

export const dashboardShortcuts = {
  "bookmark-dashboard": {
    get name() {
      return t`Bookmark Dashboard`;
    },
    shortcut: ["o"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When viewing`,
  },
  "add-filter": {
    get name() {
      return t`Add Filter`;
    },
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When editing`,
  },
  "add-notebook-question": {
    get name() {
      return t`Add Notebook Question`;
    },
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When editing`,
  },
  "add-native-question": {
    get name() {
      return t`Add Native Question`;
    },
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When editing`,
  },
  "cancel-edit": {
    get name() {
      return t`Cancel Edit Dashboard`;
    },
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When editing`,
  },
  "trash-dashboard": {
    get name() {
      return t`Send tashboard to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When viewing`,
  },
  "info-dashboard": {
    get name() {
      return t`Toggle Dashboard Info`;
    },
    shortcut: ["]"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When viewing`,
  },
  "edit-dashboard": {
    get name() {
      return t`Edit Dashboard`;
    },
    shortcutGroup: "dashboard",
    shortcut: ["e"],
    shortcutContext: t`When viewing`,
  },
  "save-dashboard": {
    get name() {
      return t`Save Dashboard`;
    },
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    shortcutContext: t`When editing`,
  },
};
