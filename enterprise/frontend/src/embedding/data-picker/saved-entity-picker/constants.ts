import { t } from "ttag";

export const CARD_INFO = {
  question: {
    get title() {
      return t`Saved Questions`;
    },
    model: "card",
    icon: "table2",
  },
  model: {
    get title() {
      return t`Models`;
    },
    model: "dataset",
    icon: "model",
  },
} as const;
