import type { CardType, SearchModel } from "metabase-types/api";

export const CARD_TYPE_MODEL = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const satisfies Record<CardType, SearchModel>;
