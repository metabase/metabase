import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListMode } from "./types";

const BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "transform",
];

const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "model",
  "metric",
  "segment",
  "snippet",
];

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}
