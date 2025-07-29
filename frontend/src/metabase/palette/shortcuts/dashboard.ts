import { t } from "ttag";

import { ELLIPSIS } from "../constants";

export const dashboardShortcuts = {
  "dashboard-bookmark": {
    get name() {
      return t`Bookmark dashboard`;
    },
    shortcut: ["o"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-add-filter": {
    get name() {
      return t`Add filter`;
    },
    shortcut: ["f"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-toggle-add-question-sidepanel": {
    get name() {
      return t`Open question sidebar`;
    },
    shortcut: ["a"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-notebook-question": {
    get name() {
      return t`Add query builder question`;
    },
    shortcut: ["q"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-add-native-question": {
    get name() {
      return t`Add native question`;
    },
    shortcut: ["n"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-cancel-edit": {
    get name() {
      return t`Cancel edit dashboard`;
    },
    shortcut: ["e"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When editing`;
    },
  },
  "dashboard-send-to-trash": {
    get name() {
      return t`Send dashboard to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-toggle-info-sidebar": {
    get name() {
      return t`Toggle dashboard info`;
    },
    shortcut: ["]"],
    shortcutGroup: "dashboard" as const,
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-edit": {
    get name() {
      return t`Edit dashboard`;
    },
    shortcutGroup: "dashboard" as const,
    shortcut: ["e"],
    get shortcutContext() {
      return t`When viewing`;
    },
  },
  "dashboard-save": {
    get name() {
      return t`Save dashboard`;
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
