import { skipToken } from "metabase/api";
import type {
  CheckReplaceSourceInfo,
  DependencyNode,
  ReplaceSourceEntry,
} from "metabase-types/api";

import { DEPENDENT_TYPES } from "./constants";
import type { TabInfo } from "./types";

export function getTabs(
  nodes: DependencyNode[] | undefined,
  checkInfo: CheckReplaceSourceInfo | undefined,
): TabInfo[] {
  const tabs: TabInfo[] = [];
  if (nodes == null) {
    return [];
  }

  tabs.push({ type: "descendants", nodes: nodes });
  if (checkInfo?.errors != null) {
    tabs.push(
      ...checkInfo.errors.map((error) => ({ type: error.type, error })),
    );
  }
  return tabs;
}

export function getDescendantsRequest(
  source: ReplaceSourceEntry | undefined,
  target: ReplaceSourceEntry | undefined,
) {
  if (source == null || target == null) {
    return skipToken;
  }
  return {
    id: source.id,
    type: source.type,
    dependent_types: DEPENDENT_TYPES,
  };
}

export function getCheckReplaceSourceRequest(
  source: ReplaceSourceEntry | undefined,
  target: ReplaceSourceEntry | undefined,
) {
  if (source == null || target == null) {
    return skipToken;
  }
  return {
    source_entity_id: source.id,
    source_entity_type: source.type,
    target_entity_id: target.id,
    target_entity_type: target.type,
  };
}

export function getReplaceSourceRequest(
  source: ReplaceSourceEntry,
  target: ReplaceSourceEntry,
) {
  return {
    source_entity_id: source.id,
    source_entity_type: source.type,
    target_entity_id: target.id,
    target_entity_type: target.type,
  };
}
