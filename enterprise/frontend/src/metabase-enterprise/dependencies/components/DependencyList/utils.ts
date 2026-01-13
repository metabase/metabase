import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListMode } from "./types";

const ALL_BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "transform",
];

const DEFAULT_BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "model",
  "metric",
  "segment",
  "measure",
  "transform",
];

const ALL_UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "snippet",
];

const DEFAULT_UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "model",
  "metric",
  "segment",
  "measure",
  "snippet",
];

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "broken"
    ? ALL_BROKEN_GROUP_TYPES
    : ALL_UNREFERENCED_GROUP_TYPES;
}

export function getDefaultGroupTypes(mode: DependencyListMode) {
  return mode === "broken"
    ? DEFAULT_BROKEN_GROUP_TYPES
    : DEFAULT_UNREFERENCED_GROUP_TYPES;
}
