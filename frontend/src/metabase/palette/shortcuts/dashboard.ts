import { t } from "ttag";

export const dashboardShortcuts = {
  "bookmark-dashboard": {
    get name() {
      return t`Bookmark Dashboard`;
    },
    shortcut: ["o"],
    shortcutGroup: "dashboard",
  },
  "add-filter": {
    get name() {
      return t`Add Filter`;
    },
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-notebook-question": {
    get name() {
      return t`Add Notebook Question`;
    },
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-native-question": {
    get name() {
      return t`Add Native Question`;
    },
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "cancel-edit": {
    get name() {
      return t`Cancel Edit Dashboard`;
    },
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "trash-dashboard": {
    get name() {
      return t`Send tashboard to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
  },
  "info-dashboard": {
    get name() {
      return t`Toggle Dashboard Info`;
    },
    shortcut: ["]"],
    shortcutGroup: "dashboard",
  },
  "edit-dashboard": {
    get name() {
      return t`Edit Dashboard`;
    },
    shortcutGroup: "dashboard",
    shortcut: ["e"],
  },
  "save-dashboard": {
    get name() {
      return t`Save Dashboard`;
    },
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
};
