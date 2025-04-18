import { t } from "ttag";

export const globalShortcuts = {
  "create-question": {
    get name() {
      return t`Create a question`;
    },
    shortcut: ["q"],
    shortcutGroup: "global",
  },
  "create-native-query": {
    get name() {
      return t`Create a native query`;
    },
    shortcut: ["n"],
    shortcutGroup: "global",
  },
  "create-dashboard": {
    get name() {
      return t`Create a dashboard`;
    },
    shortcut: ["d"],
    shortcutGroup: "global",
  },
  "create-collection": {
    get name() {
      return t`Create a collection`;
    },
    shortcut: ["c"],
    shortcutGroup: "global",
  },
  "create-model": {
    get name() {
      return t`Create a model`;
    },
    shortcut: ["m"],
    shortcutGroup: "global",
  },
  "create-metric": {
    get name() {
      return t`Create a metric`;
    },
    shortcut: ["k"],
    shortcutGroup: "global",
  },
  "browse-database": {
    get name() {
      return t`Browse databases`;
    },
    shortcut: ["b d"],
    shortcutGroup: "global",
  },
  "browse-model": {
    get name() {
      return t`Browse models`;
    },
    shortcut: ["b m"],
    shortcutGroup: "global",
  },
  "browse-metric": {
    get name() {
      return t`Browse metrics`;
    },
    shortcut: ["b k"],
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
    shortcut: ["t"],
    shortcutGroup: "global",
  },
  "navigate-personal-collection": {
    get name() {
      return t`Open personal collection`;
    },
    shortcut: ["p"],
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
    name: t`Go to home`,
    shortcut: ["g h"],
    shortcutGroup: "global",
  },
};
