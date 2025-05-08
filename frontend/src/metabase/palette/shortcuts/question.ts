import { t } from "ttag";

export const questionShortcuts = {
  "query-builder-toggle-notebook-editor": {
    get name() {
      return t`Toggle Notebook`;
    },
    shortcut: ["e"],
    shortcutGroup: "question" as const,
  },
  "query-builder-visualization-open-filter": {
    get name() {
      return t`Open filter dropdown`;
    },
    shortcut: ["f"],
    shortcutGroup: "question" as const,
  },
  "query-builder-toggle-summarize-sidebar": {
    get name() {
      return t`Open summarize sidebar`;
    },
    shortcut: ["s"],
    shortcutGroup: "question" as const,
  },
  "query-builder-bookmark": {
    get name() {
      return t`Bookmark Question`;
    },
    shortcut: ["o"],
    shortcutGroup: "question" as const,
  },
  "query-builder-info-sidebar": {
    get name() {
      return t`Open question info`;
    },
    shortcut: ["]"],
    shortcutGroup: "question" as const,
  },
  "query-builder-data-refresh": {
    get name() {
      return t`Refetch question data`;
    },
    shortcut: ["r"],
    shortcutGroup: "question" as const,
  },
  "query-builder-toggle-visualization": {
    get name() {
      return t`Toggle visualization`;
    },
    shortcut: ["v"],
    shortcutGroup: "question" as const,
  },
  "query-builder-toggle-viz-settings": {
    get name() {
      return t`Toggle viz settings`;
    },
    shortcutGroup: "question" as const,
    shortcut: ["y"],
  },
  "query-builder-toggle-viz-types": {
    get name() {
      return t`Toggle viz types`;
    },
    shortcutGroup: "question" as const,
    shortcut: ["t"],
  },
  "query-builder-send-to-trash": {
    get name() {
      return t`Send question to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "question" as const,
  },
};
