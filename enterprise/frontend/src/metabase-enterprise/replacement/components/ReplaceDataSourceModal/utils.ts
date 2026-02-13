import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import type {
  DependencyNode,
  ReplaceSourceEntry,
  ReplaceSourceInfo,
} from "metabase-types/api";

import { DEPENDENT_TYPES } from "./constants";
import type { TabInfo, TabType, ValidationInfo } from "./types";

export function getTabs(
  nodes: DependencyNode[] | undefined,
  checkInfo: ReplaceSourceInfo | undefined,
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

export function shouldResetTab(
  tabs: TabInfo[],
  selectedTabType: TabType | undefined,
) {
  return tabs.length === 0
    ? selectedTabType == null
    : !tabs.some((tab) => tab.type === selectedTabType);
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
  checkInfo: ReplaceSourceInfo | undefined,
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

export function getSubmitLabel(
  nodes: DependencyNode[] | undefined,
  validationInfo: ValidationInfo,
): string {
  if (nodes == null || !validationInfo.isValid) {
    return t`Replace data source`;
  }

  return ngettext(
    msgid`Replace data source in ${nodes.length} item`,
    `Replace data source in ${nodes.length} items`,
    nodes.length,
  );
}

export function getSuccessToastMessage(nodes: DependencyNode[] = []): string {
  return ngettext(
    msgid`Updated ${nodes.length} item`,
    `Updated ${nodes.length} items`,
    nodes.length,
  );
}
