import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListMode } from "./types";

const BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "metric",
];

const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "snippet",
];

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}
