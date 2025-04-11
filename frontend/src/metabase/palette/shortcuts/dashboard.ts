import { t } from "ttag";

export const dashboardShortcuts = {
  "bookmark-dashboard": {
    name: t`Bookmark Dashboard`,
    shortcut: ["o"],
    shortcutGroup: "dashboard",
  },
  "add-filter": {
    name: t`Add Filter`,
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-notebook-question": {
    name: t`Add Notebook Question`,
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "add-native-question": {
    name: t`Add Native Question`,
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "cancel-edit": {
    name: t`Cancel Edit Dashboard`,
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "trash-dashboard": {
    name: t`Send tashboard to trash`,
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
  },
  "info-dashboard": {
    name: t`Toggle Dashboard Info`,
    shortcut: ["]"],
    shortcutGroup: "dashboard",
  },
  "edit-dashboard": {
    name: t`Edit Dashboard`,
    shortcutGroup: "dashboard",
    shortcut: ["e"],
  },
  "save-dashboard": {
    name: t`Save Dashboard`,
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
};
