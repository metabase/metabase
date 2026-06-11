import { t } from "ttag";

export const globalShortcuts = {
  "create-new-question": {
    get name() {
      return t`Create a question`;
    },
    get keywords() {
      return t`add question`;
    },
    shortcut: ["c q"],
    shortcutGroup: "global" as const,
  },
  "create-new-native-query": {
    get name() {
      return t`Create a native query`;
    },
    get keywords() {
      return t`add native query, add SQL, create SQL, new SQL`;
    },
    shortcut: ["c n"],
    shortcutGroup: "global" as const,
  },
  "create-new-dashboard": {
    get name() {
      return t`Create a dashboard`;
    },
    get keywords() {
      return t`add dashboard`;
    },
    shortcut: ["c d"],
    shortcutGroup: "global" as const,
  },
  "create-new-document": {
    get name() {
      return t`Create a document`;
    },
    get keywords() {
      return t`add document`;
    },
    shortcut: ["c t"],
    shortcutGroup: "global" as const,
  },
  "create-new-collection": {
    get name() {
      return t`Create a collection`;
    },
    get keywords() {
      return t`add collection`;
    },
    shortcut: ["c f"],
    shortcutGroup: "global" as const,
  },
  "create-new-model": {
    get name() {
      return t`Create a model`;
    },
    get keywords() {
      return t`add model`;
    },
    shortcut: ["c m"],
    shortcutGroup: "global" as const,
  },
  "create-new-metric": {
    get name() {
      return t`Create a metric`;
    },
    get keywords() {
      return t`add metric`;
    },
    shortcut: ["c k"],
    shortcutGroup: "global" as const,
  },
  "navigate-browse-database": {
    get name() {
      return t`Browse databases`;
    },
    get keywords() {
      return t`go to databases, view databases, open databases`;
    },
    shortcut: ["g d"],
    shortcutGroup: "global" as const,
  },
  "navigate-browse-model": {
    get name() {
      return t`Browse models`;
    },
    get keywords() {
      return t`go to models, view models, open models`;
    },
    shortcut: ["g m"],
    shortcutGroup: "global" as const,
  },
  "navigate-browse-metric": {
    get name() {
      return t`Browse metrics`;
    },
    get keywords() {
      return t`go to metrics, view metrics, open metrics`;
    },
    shortcut: ["g k"],
    shortcutGroup: "global" as const,
  },
  "navigate-data-studio": {
    get name() {
      return t`Go to Data Studio`;
    },
    get keywords() {
      return t`open data studio, view data studio`;
    },
    shortcut: ["g s"],
    shortcutGroup: "global" as const,
  },

  "download-diagnostics": {
    get name() {
      return t`Download diagnostics`;
    },
    shortcut: ["$mod+f1"],
    shortcutGroup: "global" as const,
  },
  "shortcuts-modal": {
    get name() {
      return t`View shortcuts`;
    },
    shortcut: ["Shift+?"],
    shortcutDisplay: ["?"],
    shortcutGroup: "global" as const,
  },

  "navigate-trash": {
    get name() {
      return t`Open trash`;
    },
    shortcut: ["g t"],
    shortcutGroup: "global" as const,
  },
  "navigate-personal-collection": {
    get name() {
      return t`Open personal collection`;
    },
    shortcut: ["g p"],
    shortcutGroup: "global" as const,
  },

  "toggle-navbar": {
    get name() {
      return t`Toggle sidebar`;
    },
    shortcut: ["["],
    shortcutGroup: "global" as const,
  },
  "navigate-admin-settings": {
    get name() {
      return t`Go to admin`;
    },
    shortcut: ["g a"],
    shortcutGroup: "global" as const,
  },

  "navigate-user-settings": {
    get name() {
      return t`Go to user settings`;
    },
    get keywords() {
      return t`open user settings, view user settings, account settings`;
    },
    shortcut: ["g u"],
    shortcutGroup: "global" as const,
  },

  "navigate-home": {
    get name() {
      return t`Go to home`;
    },
    get keywords() {
      return t`open home, view home`;
    },
    shortcut: ["g h"],
    shortcutGroup: "global" as const,
  },

  "navigate-embed-js": {
    get name() {
      return t`New embed`;
    },

    shortcut: ["c e"],
    shortcutGroup: "global" as const,
  },

  "toggle-dark-mode": {
    get name() {
      return t`Toggle dark/light mode`;
    },

    section: "basic",
    keywords:
      "toggle, toggle dark, toggle light, dark, light, dark mode, light mode, theme, mode, night",
    icon: "moon",

    shortcut: ["$mod+Shift+KeyL"],
    shortcutGroup: "global" as const,
  },

  "toggle-dark-mode-2": {
    get name() {
      return t`Toggle dark mode`;
    },
    shortcutGroup: "global" as const,
    hide: true,
    shortcut: [
      "ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight B A",
    ],
  },
};
