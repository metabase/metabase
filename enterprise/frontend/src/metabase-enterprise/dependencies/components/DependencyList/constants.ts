import type { CardType, DependencyType } from "metabase-types/api";

export const BROKEN_TYPES: DependencyType[] = ["table", "card"];

export const BROKEN_CARD_TYPES: CardType[] = ["question", "model"];

export const UNREFERENCED_TYPES: DependencyType[] = [
  "table",
  "card",
  "segment",
  "measure",
  "snippet",
];

export const UNREFERENCED_CARD_TYPES: CardType[] = [
  "question",
  "model",
  "metric",
];

export const BROKEN_DEPENDENTS_TYPES: DependencyType[] = [
  "card",
  "transform",
  "segment",
  "measure",
];

export const BROKEN_DEPENDENTS_CARD_TYPES: CardType[] = [
  "question",
  "model",
  "metric",
];

export const PAGE_SIZE = 25;
