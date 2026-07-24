import type { CollectionId } from "./collection";
import type { PaginationRequest } from "./pagination";
import type { SortDirection } from "./sorting";
import type { UserId } from "./user";

export const CONTENT_DIAGNOSTICS_FINDING_TYPES = ["stale"] as const;
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
  "card",
  "dashboard",
  "document",
  "transform",
] as const;
export type ContentDiagnosticsFilterType =
  (typeof CONTENT_DIAGNOSTICS_FILTER_TYPES)[number];

export const CONTENT_DIAGNOSTICS_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "last-active-at",
] as const;
export type ContentDiagnosticsSortColumn =
  (typeof CONTENT_DIAGNOSTICS_SORT_COLUMNS)[number];

export type ContentDiagnosticsUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
  sort_column?: ContentDiagnosticsSortColumn;
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

export type ContentDiagnosticsFindingDetails = {
  collection: ContentDiagnosticsCollection | null;
  description: string | null;
  owner: ContentDiagnosticsUser | null;
  creator: ContentDiagnosticsUser | null;
  view_count?: number;
  threshold_days?: number;
};

export type ContentDiagnosticsFinding = {
  id: number;
  finding_type: ContentDiagnosticsFindingType;
  entity_type: ContentDiagnosticsEntityType;
  entity_id: number;
  detected_at: string;
  entity_display_name: string | null;
  created_at: string | null;
  last_active_at: string | null;
  details: ContentDiagnosticsFindingDetails;
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
  "sort-column"?: ContentDiagnosticsSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListStaleFindingsResponse = {
  data: ContentDiagnosticsFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};
