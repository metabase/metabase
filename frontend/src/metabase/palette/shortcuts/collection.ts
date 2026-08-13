import { t } from "ttag";

import type { ShortcutGroup } from "../types";

const shortcutGroup: ShortcutGroup = "collection";

export const collectionShortcuts = {
  "collection-send-items-to-trash": {
    get name() {
      return t`Move collection items to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup,
  },
  "collection-clear-selection": {
    get name() {
      return t`Clear selection`;
    },
    shortcut: ["Escape"],
    shortcutGroup,
  },
  "collection-trash-selected-items": {
    get name() {
      return t`Move selected items to trash`;
    },
    shortcut: ["Delete"],
    shortcutDisplay: ["Delete", "Backspace"],
    shortcutGroup,
  },
  "collection-trash-selected-items-backspace": {
    get name() {
      return t`Move selected items to trash`;
    },
    shortcut: ["Backspace"],
    hide: true,
    shortcutGroup,
  },
};
