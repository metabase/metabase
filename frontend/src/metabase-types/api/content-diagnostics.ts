import type { CardType } from "./card";
import type { CollectionId } from "./collection";
import type { PaginationRequest } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

export const CONTENT_DIAGNOSTICS_FINDING_TYPES = ["stale", "slow"] as const;
export type ContentDiagnosticsFindingType =
  (typeof CONTENT_DIAGNOSTICS_FINDING_TYPES)[number];

export const CONTENT_DIAGNOSTICS_ENTITY_TYPES = [
  "card",
  "dashboard",
  "document",
  "transform",
] as const;
export type ContentDiagnosticsEntityType =
  (typeof CONTENT_DIAGNOSTICS_ENTITY_TYPES)[number];

export const CONTENT_DIAGNOSTICS_FILTER_TYPES = [
  "question",
  "model",
  "metric",
  "dashboard",
  "document",
  "transform",
] as const;
export type ContentDiagnosticsFilterType =
  (typeof CONTENT_DIAGNOSTICS_FILTER_TYPES)[number];

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

export type ContentDiagnosticsStaleUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
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
  details: ContentDiagnosticsBaseFindingDetails;
};

export type ContentDiagnosticsStaleFindingDetails =
  ContentDiagnosticsBaseFindingDetails & {
    threshold_days?: number;
  };

export type ContentDiagnosticsStaleFinding = ContentDiagnosticsBaseFinding & {
  finding_type: "stale";
  last_active_at: string | null;
  details: ContentDiagnosticsStaleFindingDetails;
};

export type ContentDiagnosticsScanResult = {
  scan_id: string;
  finding_count: number;
  entities_scanned: number;
  duration_ms: number;
};

export type ListStaleFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsFilterType[];
  "include-personal-collections"?: boolean;
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
  entity_types?: ContentDiagnosticsFilterType[];
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
  duration_ms: number;
  details: ContentDiagnosticsSlowFindingDetails;
};

export type ListSlowFindingsRequest = {
  query?: string;
  "entity-types"?: ContentDiagnosticsFilterType[];
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
