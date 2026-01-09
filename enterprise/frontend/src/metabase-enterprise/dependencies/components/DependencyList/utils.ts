import { t } from "ttag";

import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyListMode } from "./types";

const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "model",
  "metric",
  "segment",
  "snippet",
];

export function getAvailableGroupTypes(_mode: DependencyListMode) {
  return UNREFERENCED_GROUP_TYPES;
}

export function getNotFoundMessage(_mode: DependencyListMode) {
  return t`No unreferenced entities found`;
}
