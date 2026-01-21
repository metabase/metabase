import type { CardType, DependencyType } from "metabase-types/api";

import type { DependencyListMode } from "./types";

const BROKEN_TYPES: DependencyType[] = ["table", "card"];

const BROKEN_CARD_TYPES: CardType[] = ["question", "model"];

const UNREFERENCED_TYPES: DependencyType[] = [
  "table",
  "card",
  "segment",
  "measure",
  "snippet",
];

const UNREFERENCED_CARD_TYPES: CardType[] = ["question", "model", "metric"];

export function getAvailableTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_TYPES : UNREFERENCED_TYPES;
}

export function getAvailableCardTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_CARD_TYPES : UNREFERENCED_CARD_TYPES;
}
