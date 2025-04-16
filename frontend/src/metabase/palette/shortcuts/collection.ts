import { t } from "ttag";

export const collectionShortcuts = {
  "collection-trash": {
    get name() {
      return t`Move collection items to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "collection",
  },
};
