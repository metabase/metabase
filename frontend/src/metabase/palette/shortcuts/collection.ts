import { t } from "ttag";

import type { ShortcutGroup } from "../types";

const shortcutGroup: ShortcutGroup = "collection";

export const collectionShortcuts = {
  "collection-send-items-to-trash": {
    get name() {
      return t`Move selected items to trash`;
    },
    shortcut: ["(Delete|Backspace)"],
    shortcutDisplay: ["Delete", "Backspace"],
    shortcutGroup,
  },
  "collection-clear-selection": {
    get name() {
      return t`Clear selection`;
    },
    shortcut: ["Escape"],
    shortcutGroup,
  },
};
