import {
  BROKEN_CARD_TYPES,
  BROKEN_TYPES,
  UNREFERENCED_CARD_TYPES,
  UNREFERENCED_TYPES,
} from "./constants";
import type { DependencyListMode } from "./types";

export function getAvailableTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_TYPES : UNREFERENCED_TYPES;
}

export function getAvailableCardTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_CARD_TYPES : UNREFERENCED_CARD_TYPES;
}
