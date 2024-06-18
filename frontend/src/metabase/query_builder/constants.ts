export const MODAL_TYPES = {
  SAVE: "save",
  ADD_TO_DASHBOARD: "add-to-dashboard",
  MOVE: "move",
  CLONE: "clone",
  ARCHIVE: "archive",
  SAVED: "saved",
  ADD_TO_DASHBOARD_SAVE: "add-to-dashboard-save",
  CREATE_ALERT: "create-alert",
  SAVE_QUESTION_BEFORE_ALERT: "save-question-before-alert",
  SAVE_QUESTION_BEFORE_EMBED: "save-question-before-embed",
  FILTERS: "filters",
  EMBED: "embed",
  TURN_INTO_DATASET: "turn-into-dataset",
  CAN_NOT_CREATE_MODEL: "can-not-create-model",
  NEW_EVENT: "new-event",
  EDIT_EVENT: "edit-event",
  MOVE_EVENT: "move-event",
  PREVIEW_QUERY: "preview-query",
} as const;

export const SIDEBAR_SIZES = {
  NORMAL: 355,
  TIMELINE: 300,
};

export const VISUALIZATION_SLOW_TIMEOUT = 15 * 1000;
