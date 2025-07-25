import { t } from "ttag";

export const collectionShortcuts = {
  "collection-send-items-to-trash": {
    get name() {
      return t`Move collection items to trash`;
    },
    shortcut: ["$mod+backspace"],
    shortcutGroup: "collection" as const,
  },
};
