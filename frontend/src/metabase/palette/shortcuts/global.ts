import { t } from "ttag";

export const globalShortcuts = {
  "create-new-question": {
    get name() {
      return t`Create a question`;
    },
    shortcut: ["c q"],
    shortcutGroup: "global",
  },
  "create-new-native-query": {
    get name() {
      return t`Create a native query`;
    },
    shortcut: ["c n"],
    shortcutGroup: "global",
  },
  "create-new-dashboard": {
    get name() {
      return t`Create a dashboard`;
    },
    shortcut: ["c d"],
    shortcutGroup: "global",
  },
  "create-new-collection": {
    get name() {
      return t`Create a collection`;
    },
    shortcut: ["c f"],
    shortcutGroup: "global",
  },
  "create-new-model": {
    get name() {
      return t`Create a model`;
    },
    shortcut: ["c m"],
    shortcutGroup: "global",
  },
  "create-new-metric": {
    get name() {
      return t`Create a metric`;
    },
    shortcut: ["c k"],
    shortcutGroup: "global",
  },
  "navigate-browse-database": {
    get name() {
      return t`Browse databases`;
    },
    shortcut: ["g d"],
    shortcutGroup: "global",
  },
  "navigate-browse-model": {
    get name() {
      return t`Browse models`;
    },
    shortcut: ["g m"],
    shortcutGroup: "global",
  },
  "navigate-browse-metric": {
    get name() {
      return t`Browse metrics`;
    },
    shortcut: ["g k"],
    shortcutGroup: "global",
  },

  "report-issue": {
    get name() {
      return t`Report an issue`;
    },
    shortcut: ["$mod+f1"],
    shortcutGroup: "global",
  },
  "shortcuts-modal": {
    get name() {
      return t`Toggle Shortcuts Modal`;
    },
    shortcut: ["?"],
    shortcutGroup: "global",
  },

  "navigate-trash": {
    get name() {
      return t`Open trash`;
    },
    shortcut: ["g t"],
    shortcutGroup: "global",
  },
  "navigate-personal-collection": {
    get name() {
      return t`Open personal collection`;
    },
    shortcut: ["g p"],
    shortcutGroup: "global",
  },

  "toggle-navbar": {
    get name() {
      return t`Toggle sidebar`;
    },
    shortcut: ["["],
    shortcutGroup: "global",
  },
  "navigate-admin-settings": {
    get name() {
      return t`Go to admin`;
    },
    shortcut: ["g a"],
    shortcutGroup: "global",
  },

  "navigate-user-settings": {
    get name() {
      return t`Go to user settings`;
    },
    shortcut: ["g u"],
    shortcutGroup: "global",
  },

  "navigate-home": {
    get name() {
      return t`Go to home`;
    },
    shortcut: ["g h"],
    shortcutGroup: "global",
  },
};
