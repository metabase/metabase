import { t } from "ttag";

export const dashboardShortcuts = {
  "dashboard-bookmark": {
    get name() {
      return t`Bookmark Dashboard`;
    },
    shortcut: ["o"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-add-filter": {
    get name() {
      return t`Add Filter`;
    },
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-notebook-question": {
    get name() {
      return t`Add Notebook Question`;
    },
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-native-question": {
    get name() {
      return t`Add Native Question`;
    },
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-cancel-edit": {
    get name() {
      return t`Cancel Edit Dashboard`;
    },
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-send-to-trash": {
    get name() {
      return t`Send tashboard to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-toggle-info-sidebar": {
    get name() {
      return t`Toggle Dashboard Info`;
    },
    shortcut: ["]"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-edit": {
    get name() {
      return t`Edit Dashboard`;
    },
    shortcutGroup: "dashboard",
    shortcut: ["e"],
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-save": {
    get name() {
      return t`Save Dashboard`;
    },
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    get shortcutContext() {
      return t`When editing`;
    },
  },
};
