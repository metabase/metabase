import { t } from "ttag";

export const questionShortcuts = {
  "query-builder-toggle-notebook-editor": {
    get name() {
      return t`Toggle Notebook`;
    },
    shortcut: ["e"],
    shortcutGroup: "question",
  },
  "query-builder-visualization-open-filter": {
    get name() {
      return t`Open filter dropdown`;
    },
    shortcut: ["f"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-summarize-sidebar": {
    get name() {
      return t`Open summarize sidebar`;
    },
    shortcut: ["s"],
    shortcutGroup: "question",
  },
  "query-builder-bookmark": {
    get name() {
      return t`Bookmark Question`;
    },
    shortcut: ["o"],
    shortcutGroup: "question",
  },
  "query-builder-info-sidebar": {
    get name() {
      return t`Open question info`;
    },
    shortcut: ["]"],
    shortcutGroup: "question",
  },
  "query-builder-data-refresh": {
    get name() {
      return t`Refetch question data`;
    },
    shortcut: ["r"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-visualization": {
    get name() {
      return t`Toggle viz settings`;
    },
    shortcut: ["v"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-viz-settings": {
    get name() {
      return t`Toggle viz settings`;
    },
    shortcutGroup: "question",
    shortcut: ["z s"],
  },
  "query-builder-toggle-viz-types": {
    get name() {
      return t`Toggle viz types`;
    },
    shortcutGroup: "question",
    shortcut: ["z t"],
  },
  "query-builder-send-to-trash": {
    get name() {
      return t`Send question to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "question",
  },
};
