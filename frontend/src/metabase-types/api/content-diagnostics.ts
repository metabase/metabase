import type { CardType } from "./card";
import type { CollectionId, CollectionNamespace } from "./collection";
import type { PaginationRequest } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

export const CONTENT_DIAGNOSTICS_IMBALANCED_FINDING_TYPES = [
  "empty",
  "sparse",
  "crowded",
] as const;
export type ContentDiagnosticsImbalancedFindingType =
  (typeof CONTENT_DIAGNOSTICS_IMBALANCED_FINDING_TYPES)[number];

export const CONTENT_DIAGNOSTICS_FINDING_TYPES = [
  "stale",
  "slow",
  "duplicated",
  ...CONTENT_DIAGNOSTICS_IMBALANCED_FINDING_TYPES,
] as const;
export type ContentDiagnosticsFindingType =
  (typeof CONTENT_DIAGNOSTICS_FINDING_TYPES)[number];

export const CONTENT_DIAGNOSTICS_ENTITY_TYPES = [
  "card",
  "dashboard",
  "document",
  "transform",
  "collection",
] as const;
export type ContentDiagnosticsEntityType =
  (typeof CONTENT_DIAGNOSTICS_ENTITY_TYPES)[number];

export type ContentDiagnosticsNonCollectionEntityType = Exclude<
  ContentDiagnosticsEntityType,
  "collection"
>;

export const CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES = [
  "question",
  "model",
  "metric",
  "dashboard",
  "document",
  "transform",
] as const;

/** Every filter value any endpoint accepts; each endpoint pins its own subset. */
export const CONTENT_DIAGNOSTICS_FILTER_TYPES = [
  ...CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  "collection",
] as const;
export type ContentDiagnosticsFilterType =
  (typeof CONTENT_DIAGNOSTICS_FILTER_TYPES)[number];

export type ContentDiagnosticsNonCollectionFilterType = Exclude<
  ContentDiagnosticsFilterType,
  "collection"
>;

export const CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "last-active-at",
] as const;
export type ContentDiagnosticsStaleSortColumn =
  (typeof CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS)[number];

export const CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "duration-ms",
] as const;
export type ContentDiagnosticsSlowSortColumn =
  (typeof CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS)[number];

export const CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "duplicate-count",
] as const;
export type ContentDiagnosticsDuplicatedSortColumn =
  (typeof CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS)[number];

export const CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "content-count",
] as const;
export type ContentDiagnosticsImbalancedSortColumn =
  (typeof CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS)[number];

export const CONTENT_DIAGNOSTICS_IMBALANCED_UNITS = [
  "items",
  "dashcards",
  "rows",
  "cards",
  "tabs",
] as const;
export type ContentDiagnosticsImbalancedUnit =
  (typeof CONTENT_DIAGNOSTICS_IMBALANCED_UNITS)[number];

export type ContentDiagnosticsStaleUserParams = {
  entity_types?: ContentDiagnosticsNonCollectionFilterType[];
  include_personal_collections?: boolean;
  threshold_days?: number;
  sort_column?: ContentDiagnosticsStaleSortColumn;
  sort_direction?: SortDirection;
};

export type ContentDiagnosticsUser =
  | {
      type: "user";
      id: UserId;
      name: string | null;
      email: string | null;
    }
  | {
      type: "external";
      email: string | null;
    };

export type ContentDiagnosticsCollection = {
  id: CollectionId;
  name: string;
  namespace: CollectionNamespace;
  effective_ancestors: Array<{ id: CollectionId; name: string }>;
};

export type ContentDiagnosticsBaseFindingDetails = {
  collection: ContentDiagnosticsCollection | null;
  description: string | null;
  owner: ContentDiagnosticsUser | null;
  creator: ContentDiagnosticsUser | null;
  view_count?: number;
};

export type ContentDiagnosticsBaseFinding = {
  id: number;
  finding_type: ContentDiagnosticsFindingType;
  entity_type: ContentDiagnosticsEntityType;
  card_type?: CardType | null;
  entity_id: number;
  detected_at: string;
  entity_display_name: string | null;
  created_at: string | null;
  can_write: boolean;
  details: ContentDiagnosticsBaseFindingDetails;
};

export type ContentDiagnosticsStaleFindingDetails =
  ContentDiagnosticsBaseFindingDetails & {
    threshold_days?: number;
  };

export type ContentDiagnosticsStaleFinding = ContentDiagnosticsBaseFinding & {
  finding_type: "stale";
  entity_type: ContentDiagnosticsNonCollectionEntityType;
  last_active_at: string | null;
  details: ContentDiagnosticsStaleFindingDetails;
};

export type ListStaleFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsNonCollectionFilterType[];
  "include-personal-collections"?: boolean;
  "threshold-days"?: number;
  "sort-column"?: ContentDiagnosticsStaleSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListStaleFindingsResponse = {
  data: ContentDiagnosticsStaleFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};

export type ContentDiagnosticsSlowUserParams = {
  entity_types?: ContentDiagnosticsNonCollectionFilterType[];
  include_personal_collections?: boolean;
  min_duration_ms?: number;
  sort_column?: ContentDiagnosticsSlowSortColumn;
  sort_direction?: SortDirection;
};

export type ContentDiagnosticsSlowEntity = {
  id: number;
  name: string | null;
  entity_type: ContentDiagnosticsEntityType;
  card_type?: CardType | null;
  view_count: number;
};

export type ContentDiagnosticsSlowFindingDetails =
  ContentDiagnosticsBaseFindingDetails & {
    threshold_ms?: number;
    slow_entities?: ContentDiagnosticsSlowEntity[];
  };

export type ContentDiagnosticsSlowFinding = ContentDiagnosticsBaseFinding & {
  finding_type: "slow";
  entity_type: ContentDiagnosticsNonCollectionEntityType;
  duration_ms: number;
  details: ContentDiagnosticsSlowFindingDetails;
};

export type ListSlowFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsNonCollectionFilterType[];
  "include-personal-collections"?: boolean;
  "min-duration-ms"?: number;
  "sort-column"?: ContentDiagnosticsSlowSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListSlowFindingsResponse = {
  data: ContentDiagnosticsSlowFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};

export type ContentDiagnosticsDuplicatedUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
  min_duplicate_count?: number;
  sort_column?: ContentDiagnosticsDuplicatedSortColumn;
  sort_direction?: SortDirection;
};

/**
 * Another kind of duplicate finding: entity of the same type sharing its normalized name.
 * Transforms and collections have no view concept, hence the optional `view_count`.
 */
export type ContentDiagnosticsDuplicateEntity = {
  id: number;
  name: string | null;
  entity_type: ContentDiagnosticsEntityType;
  card_type?: CardType | null;
  view_count?: number;
};

export type ContentDiagnosticsDuplicatedFindingDetails =
  ContentDiagnosticsBaseFindingDetails & {
    normalized_name: string;
    duplicate_entities: ContentDiagnosticsDuplicateEntity[];
  };

export type ContentDiagnosticsDuplicatedFinding =
  ContentDiagnosticsBaseFinding & {
    finding_type: "duplicated";
    duplicate_count: number;
    details: ContentDiagnosticsDuplicatedFindingDetails;
  };

export type ListDuplicatedFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsFilterType[];
  "include-personal-collections"?: boolean;
  "min-duplicate-count"?: number;
  "sort-column"?: ContentDiagnosticsDuplicatedSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListDuplicatedFindingsResponse = {
  data: ContentDiagnosticsDuplicatedFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};

export type ContentDiagnosticsImbalancedUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
  sort_column?: ContentDiagnosticsImbalancedSortColumn;
  sort_direction?: SortDirection;
};

export type ContentDiagnosticsImbalancedFindingDetails =
  ContentDiagnosticsBaseFindingDetails & {
    threshold: number;
    unit: ContentDiagnosticsImbalancedUnit;
    as_of?: string;
  };

export type ContentDiagnosticsImbalancedFinding =
  ContentDiagnosticsBaseFinding & {
    finding_type: ContentDiagnosticsImbalancedFindingType;
    content_count: number;
    details: ContentDiagnosticsImbalancedFindingDetails;
  };

// `finding-types` pins the problem type per tab (empty/sparse/crowded); it is not a
// user-facing filter, so it is absent from `ContentDiagnosticsImbalancedUserParams`.
export type ListImbalancedFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsFilterType[];
  "finding-types"?: ContentDiagnosticsImbalancedFindingType[];
  "include-personal-collections"?: boolean;
  "sort-column"?: ContentDiagnosticsImbalancedSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListImbalancedFindingsResponse = {
  data: ContentDiagnosticsImbalancedFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};
