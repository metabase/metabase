import { t } from "ttag";

export const questionShortcuts = {
  "toggle-notebook-editor": {
    name: t`Toggle Notebook`,
    shortcut: ["e"],
    shortcutGroup: "question",
  },
  "visualization-open-filter": {
    name: t`Open filter modal`,
    shortcut: ["f"],
    shortcutGroup: "question",
  },
  "toggle-summarize-sidebar": {
    name: t`Open summarize sidebar`,
    shortcut: ["s"],
    shortcutGroup: "question",
  },
  "bookmark-question": {
    name: t`Bookmark Question`,
    shortcut: ["b"],
    shortcutGroup: "question",
  },
  "question-info-sidebar": {
    name: t`Open question info`,
    shortcut: ["]"],
    shortcutGroup: "question",
  },
  "question-refresh": {
    name: t`Refetch question data`,
    shortcut: ["r"],
    shortcutGroup: "question",
  },
  "toggle-visualization": {
    name: t`Toggle viz settings`,
    shortcut: ["v"],
    shortcutGroup: "question",
  },
  "toggle-viz-settings": {
    name: t`Toggle viz settings`,
    shortcutGroup: "question",
    shortcut: ["z s"],
  },
  "toggle-viz-types": {
    name: t`Toggle viz types`,
    shortcutGroup: "question",
    shortcut: ["z t"],
  },
  "download-question": {
    name: t`Download`,
    shortcut: ["d"],
    shortcutGroup: "question",
  },
  "trash-question": {
    name: t`Send question to trash`,
    shortcut: ["$mod+backspace"],
    shortcutGroup: "question",
  },
};
