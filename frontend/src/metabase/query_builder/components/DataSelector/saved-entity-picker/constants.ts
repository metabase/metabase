import { t } from "ttag";

export const CARD_INFO = {
  question: {
    title: t`Saved Questions`,
    model: "card",
    icon: "table2",
  },
  model: {
    title: t`Models`,
    model: "dataset",
    icon: "model",
  },
  metric: {
    title: t`Metrics`,
    model: "metric",
    icon: "metric",
  },
} as const;
