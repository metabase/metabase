import { t } from "ttag";

export const CARD_INFO = {
  model: {
    get title() {
      return t`Models`;
    },
    model: "dataset",
    icon: "model",
  },
} as const;
