import { t } from "ttag";

import { skipToken } from "metabase/api";
import type {
  CheckReplaceSourceInfo,
  DependencyNode,
  ReplaceSourceEntry,
} from "metabase-types/api";

import { DEPENDENT_TYPES } from "./constants";
import type { TabInfo, ValidationInfo } from "./types";

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

export function getValidationInfo(
  source: ReplaceSourceEntry | undefined,
  target: ReplaceSourceEntry | undefined,
  nodes: DependencyNode[] | undefined,
  checkInfo: CheckReplaceSourceInfo | undefined,
): ValidationInfo {
  if (source == null) {
    return {
      isValid: false,
      errorMessage: t`Pick the original source data source`,
    };
  }

  if (target == null) {
    return {
      isValid: false,
      errorMessage: t`Pick the replacement data source`,
    };
  }

  if (source.id === target.id && source.type === target.type) {
    return {
      isValid: false,
      errorMessage: t`The original and replacement data sources cannot be the same`,
    };
  }

  if (nodes == null) {
    return {
      isValid: false,
      errorMessage: t`Fetching dependencies for the original source data source`,
    };
  }

  if (nodes.length === 0) {
    return {
      isValid: false,
      errorMessage: t`No queries found using the original source data source`,
    };
  }

  if (checkInfo == null) {
    return {
      isValid: false,
      errorMessage: t`Checking for compatibility between the original and replacement data sources`,
    };
  }

  if (!checkInfo.success) {
    return {
      isValid: false,
      errorMessage: t`The original and replacement data sources are not compatible`,
    };
  }

  return {
    isValid: true,
  };
}
