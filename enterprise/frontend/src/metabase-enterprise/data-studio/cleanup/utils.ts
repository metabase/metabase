import type { Location } from "history";
import { t } from "ttag";

import * as Urls from "metabase/urls";
import type {
  UsageMetadataCreationBlocker,
  UsageMetadataMatchRelation,
  UsageMetadataModelingStatus,
} from "metabase-types/api";

const CANDIDATE_TYPES = ["measure", "segment"] as const;
const MODELING_STATUSES = ["missing", "partially-modeled", "modeled"] as const;
const SIGNALS = ["verified", "official", "popular"] as const;
const DISMISSED_FILTERS = ["exclude", "include", "only"] as const;
const SORTS = ["priority", "name", "source-count", "view-count"] as const;
const DIRECTIONS = ["asc", "desc"] as const;
const QUEUES = ["recommended", "review", "all", "dismissed"] as const;

export function parseCleanupParams(
  location: Location,
): Urls.DataStudioCleanupParams {
  return {
    page: Urls.parseNumberParam(location.query.page),
    search: Urls.parseStringParam(location.query.search),
    databaseId: Urls.parseNumberParam(location.query.database),
    schema: Urls.parseStringParam(location.query.schema),
    candidateType: Urls.parseEnumParam(location.query.type, CANDIDATE_TYPES),
    modelingStatus: Urls.parseEnumParam(
      location.query.status,
      MODELING_STATUSES,
    ),
    signal: Urls.parseEnumParam(location.query.signal, SIGNALS),
    dismissed:
      Urls.parseEnumParam(location.query.dismissed, DISMISSED_FILTERS) ??
      "exclude",
    sort: Urls.parseEnumParam(location.query.sort, SORTS) ?? "priority",
    direction:
      Urls.parseEnumParam(location.query.direction, DIRECTIONS) ?? "asc",
    queue: Urls.parseEnumParam(location.query.queue, QUEUES) ?? "recommended",
    candidateId: Urls.parseNumberParam(location.query.candidate),
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
    (params.queue && params.queue !== "recommended"),
  );
}
