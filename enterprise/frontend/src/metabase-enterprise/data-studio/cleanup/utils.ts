import { t } from "ttag";

import * as Urls from "metabase/urls";
import type {
  UsageMetadataCandidateSummary,
  UsageMetadataCandidateType,
  UsageMetadataCreationBlocker,
  UsageMetadataMatchRelation,
  UsageMetadataModelingStatus,
} from "metabase-types/api";

export type UsageMetadataCreationCandidateType = Extract<
  UsageMetadataCandidateType,
  "measure" | "segment"
>;

export type UsageMetadataCreationCandidate = UsageMetadataCandidateSummary & {
  candidate_type: UsageMetadataCreationCandidateType;
};

const CANDIDATE_TYPES = ["table", "metric", "measure", "segment"] as const;
const QUEUES = ["suggested", "used-raw", "discarded"] as const;

export function isCreationCandidateType(
  candidateType: UsageMetadataCandidateType,
): candidateType is UsageMetadataCreationCandidateType {
  return candidateType === "measure" || candidateType === "segment";
}

export function isCreationCandidate<T extends UsageMetadataCandidateSummary>(
  candidate: T,
): candidate is T & UsageMetadataCreationCandidate {
  return isCreationCandidateType(candidate.candidate_type);
}

export function getErrorStatus(error: unknown) {
  return typeof error === "object" && error != null && "status" in error
    ? error.status
    : undefined;
}

// A candidate pruned by a snapshot promotion usually 404s (the row is already gone);
// it only 409s in the narrow window before the row is actually deleted.
export function isStaleCandidateError(error: unknown) {
  const status = getErrorStatus(error);
  return status === 409 || status === 404;
}

export function parseCleanupParams(
  searchParams: URLSearchParams,
): Urls.DataStudioCleanupParams {
  return {
    search: Urls.parseStringParam(searchParams.get("search")),
    databaseId: Urls.parseNumberParam(searchParams.get("database")),
    candidateType: Urls.parseEnumParam(
      searchParams.get("type"),
      CANDIDATE_TYPES,
    ),
    queue:
      Urls.parseEnumParam(searchParams.get("queue"), QUEUES) ?? "suggested",
    candidateId: Urls.parseNumberParam(searchParams.get("candidate")),
  };
}

export function getModelingStatusLabel(status: UsageMetadataModelingStatus) {
  switch (status) {
    case "missing":
      return t`Not in Library`;
    case "partially-modeled":
      return t`Needs review`;
    case "modeled":
      return t`Modeled, still used raw`;
  }
}

export function getMatchRelationLabel(relation: UsageMetadataMatchRelation) {
  switch (relation) {
    case "exact":
      return t`Exact match`;
    case "same-base":
      return t`Same aggregation and field`;
    case "subset":
      return t`Existing definition is a subset`;
    case "superset":
      return t`Existing definition is a superset`;
    case "overlap":
      return t`Definitions overlap`;
  }
}

export function getCreationBlockerLabel(blocker: UsageMetadataCreationBlocker) {
  switch (blocker) {
    case "table-not-published":
      return t`Publish this table before creating Library entities.`;
    case "table-inactive":
      return t`This table is inactive.`;
    case "table-uneditable":
      return t`This table cannot be edited.`;
  }
}

export function hasActiveFilters(params: Urls.DataStudioCleanupParams) {
  return Boolean(
    params.search ||
    params.databaseId ||
    (params.queue && params.queue !== "suggested"),
  );
}
