import { t } from "ttag";

import { ELLIPSIS } from "../constants";

export const adminShortcuts = {
  "admin-change-tab": {
    get name() {
      return t`Change admin tab`;
    },
    shortcut: ["([1-9])"],
    shortcutDisplay: ["1", "2", "3", ELLIPSIS],
    shortcutGroup: "admin" as const,
  },
};
