import { t } from "ttag";

import { ELLIPSIS } from "../constants";

export const dashboardShortcuts = {
  "dashboard-bookmark": {
    get name() {
      return t`Bookmark Dashboard`;
    },
    shortcut: ["o"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-add-filter": {
    get name() {
      return t`Add Filter`;
    },
    shortcut: ["f"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-toggle-add-question-sidepanel": {
    get name() {
      return t`Open Add Question Side Sheet`;
    },
    shortcut: ["a"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-notebook-question": {
    get name() {
      return t`Add Notebook Question`;
    },
    shortcut: ["q"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-native-question": {
    get name() {
      return t`Add Native Question`;
    },
    shortcut: ["n"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-cancel-edit": {
    get name() {
      return t`Cancel Edit Dashboard`;
    },
    shortcut: ["e"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-send-to-trash": {
    get name() {
      return t`Send tashboard to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-toggle-info-sidebar": {
    get name() {
      return t`Toggle Dashboard Info`;
    },
    shortcut: ["]"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-edit": {
    get name() {
      return t`Edit Dashboard`;
    },
    shortcutGroup: "dashboard" as const,
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
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-change-tab": {
    get name() {
      return t`Change dashboard tab`;
    },
    shortcut: ["([1-9])"],
    shortcutDisplay: ["1", "2", "3", ELLIPSIS],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
};
