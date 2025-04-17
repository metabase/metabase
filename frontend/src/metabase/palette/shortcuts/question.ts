import { t } from "ttag";

export const questionShortcuts = {
  "query-builder-toggle-notebook-editor": {
    name: t`Toggle Notebook`,
    shortcut: ["e"],
    shortcutGroup: "question",
  },
  "query-builder-visualization-open-filter": {
    name: t`Open filter dropdown`,
    shortcut: ["f"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-summarize-sidebar": {
    name: t`Open summarize sidebar`,
    shortcut: ["s"],
    shortcutGroup: "question",
  },
  "query-builder-bookmark": {
    name: t`Bookmark Question`,
    shortcut: ["o"],
    shortcutGroup: "question",
  },
  "query-builder-info-sidebar": {
    name: t`Open question info`,
    shortcut: ["]"],
    shortcutGroup: "question",
  },
  "query-builder-data-refresh": {
    name: t`Refetch question data`,
    shortcut: ["r"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-visualization": {
    name: t`Toggle viz settings`,
    shortcut: ["v"],
    shortcutGroup: "question",
  },
  "query-builder-toggle-viz-settings": {
    name: t`Toggle viz settings`,
    shortcutGroup: "question",
    shortcut: ["z s"],
  },
  "query-builder-toggle-viz-types": {
    name: t`Toggle viz types`,
    shortcutGroup: "question",
    shortcut: ["z t"],
  },
  "query-builder-send-to-trash": {
    name: t`Send question to trash`,
    shortcut: ["$mod+backspace"],
    shortcutGroup: "question",
  },
};
