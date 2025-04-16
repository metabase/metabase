import { t } from "ttag";

export const dashboardShortcuts = {
  "dashboard-bookmark": {
    name: t`Bookmark Dashboard`,
    shortcut: ["o"],
    shortcutGroup: "dashboard",
  },
  "dashboard-add-filter": {
    name: t`Add Filter`,
    shortcut: ["f"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "dashboard-add-notebook-question": {
    name: t`Add Notebook Question`,
    shortcut: ["a q"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "dashboard-add-native-question": {
    name: t`Add Native Question`,
    shortcut: ["a n"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "dashboard-cancel-edit": {
    name: t`Cancel Edit Dashboard`,
    shortcut: ["e"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
  "dashboard-send-to-trash": {
    name: t`Send tashboard to trash`,
    shortcut: ["$mod+backspace"],
    shortcutGroup: "dashboard",
  },
  "dashboard-toggle-info-sidebar": {
    name: t`Toggle Dashboard Info`,
    shortcut: ["]"],
    shortcutGroup: "dashboard",
  },
  "dashboard-edit": {
    name: t`Edit Dashboard`,
    shortcutGroup: "dashboard",
    shortcut: ["e"],
  },
  "dashboard-save": {
    name: t`Save Dashboard`,
    shortcut: ["s"],
    shortcutGroup: "dashboard",
    shortcutContext: "When editing",
  },
};
