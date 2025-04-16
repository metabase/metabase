import { t } from "ttag";

export const questionShortcuts = {
  "toggle-notebook-editor": {
    get name() {
      return t`Toggle Notebook`;
    },
    shortcut: ["e"],
    shortcutGroup: "question",
  },
  "visualization-open-filter": {
    get name() {
      return t`Open filter dropdown`;
    },
    shortcut: ["f"],
    shortcutGroup: "question",
  },
  "toggle-summarize-sidebar": {
    get name() {
      return t`Open summarize sidebar`;
    },
    shortcut: ["s"],
    shortcutGroup: "question",
  },
  "bookmark-question": {
    get name() {
      return t`Bookmark Question`;
    },
    shortcut: ["o"],
    shortcutGroup: "question",
  },
  "question-info-sidebar": {
    get name() {
      return t`Open question info`;
    },
    shortcut: ["]"],
    shortcutGroup: "question",
  },
  "question-refresh": {
    get name() {
      return t`Refetch question data`;
    },
    shortcut: ["r"],
    shortcutGroup: "question",
  },
  "toggle-visualization": {
    get name() {
      return t`Toggle viz settings`;
    },
    shortcut: ["v"],
    shortcutGroup: "question",
  },
  "toggle-viz-settings": {
    get name() {
      return t`Toggle viz settings`;
    },
    shortcutGroup: "question",
    shortcut: ["z s"],
  },
  "toggle-viz-types": {
    get name() {
      return t`Toggle viz types`;
    },
    shortcutGroup: "question",
    shortcut: ["z t"],
  },
  "trash-question": {
    get name() {
      return t`Send question to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "question",
  },
};
