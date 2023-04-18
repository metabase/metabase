import { t } from "ttag";

export const SIDEBAR_NAME = {
  addQuestion: "addQuestion",
  action: "action",
  clickBehavior: "clickBehavior",
  editParameter: "editParameter",
  sharing: "sharing",
  info: "info",
};

// most browsers don't use a custom message with beforeunload anymore, just putting here to retain compatibility
// https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
export const BEFORE_UNLOAD_UNSAVED_MESSAGE = t`You have unsaved changes.`;
