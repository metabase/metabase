import { t } from "ttag";

export const questionShortcuts = {
  "query-builder-toggle-notebook-editor": {
    get name() {
      return t`Switch to editor`;
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
      return t`Bookmark question`;
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
      return t`Refresh data`;
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

  "native-query-move-line-up": {
    get name() {
      return t`Move the current line up`;
    },
    shortcut: ["Alt+ArrowUp"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-move-line-down": {
    get name() {
      return t`Move the current line down`;
    },
    shortcut: ["Alt+ArrowDown"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-copy-line-up": {
    get name() {
      return t`Copy the current line up`;
    },
    shortcut: ["Alt+Shift+ArrowUp"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-copy-line-down": {
    get name() {
      return t`Copy the current line down`;
    },
    shortcut: ["Alt+Shift+ArrowDown"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-indent-line-more": {
    get name() {
      return t`Indent the current line more`;
    },
    shortcut: ["$mod+]"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-indent-line-less": {
    get name() {
      return t`Indent the current line less`;
    },
    shortcut: ["$mod+["],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-delete-current-line": {
    get name() {
      return t`Delete the current line`;
    },
    shortcut: ["Shift+$mod+k"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-jump-to-matching-bracket": {
    get name() {
      return t`Jump to the matching bracket`;
    },
    shortcut: ["Shift+$mod+\\"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-comment-current-line": {
    get name() {
      return t`Comment out the current line`;
    },
    shortcut: ["$mod+\\"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-add-cursor": {
    get name() {
      return t`Add an additional cursor`;
    },
    shortcut: ["$mod+Click"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "native-query-find-selection": {
    get name() {
      return t`Find highlighted text`;
    },
    shortcut: ["$mod+d"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
  "auto-format-expression": {
    get name() {
      return t`Format custom expression or native query`;
    },
    shortcut: ["Shift+$mod+f"],
    shortcutGroup: "question" as const,
    get shortcutContext() {
      return t`Native Editor`;
    },
  },
};
