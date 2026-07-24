// Types for the Content Diagnostics serve API. MUST stay in sync with the
// response shapes in:
// enterprise/backend/src/metabase_enterprise/content_diagnostics/api.clj

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

// The set of entity types Content Diagnostics is scoped to surface in the UI
// (entity-type filter). Matches the entity types the stale checker covers.
export const CONTENT_DIAGNOSTICS_FILTER_TYPES = [
  "card",
  "dashboard",
  "document",
  "transform",
] as const;
export type ContentDiagnosticsFilterType =
  (typeof CONTENT_DIAGNOSTICS_FILTER_TYPES)[number];

// Server-sortable stale-list columns (denormalized at scan time). A subset of
// the shown table columns — Collection is hydrated live and has no sort column.
// Values match the backend `stale-sort-column->field` param keys.
export const CONTENT_DIAGNOSTICS_SORT_COLUMNS = [
  "name",
  "entity-type",
  "created-by",
  "created-at",
  "last-active-at",
] as const;
export type ContentDiagnosticsSortColumn =
  (typeof CONTENT_DIAGNOSTICS_SORT_COLUMNS)[number];

// Persisted (last-used) filter + sort state, stored per finding-type tab via
// the `content_diagnostics` user-key-value namespace. Snake_case to match the
// stored JSON shape.
export type ContentDiagnosticsUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
  sort_column?: ContentDiagnosticsSortColumn;
  sort_direction?: SortDirection;
};

// A finding's `owner`/`creator`. A Metabase account carries `id`/`name`; an
// external (non-account) owner carries only `email`. `type` discriminates them.
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

// Permission-filtered collection breadcrumb, mirroring `:effective_ancestors`.
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

// Topline of a synchronous scan run (demo/dev `POST /scan`).
export type ContentDiagnosticsScanResult = {
  scan_id: string;
  finding_count: number;
  entities_scanned: number;
  duration_ms: number;
};

export type ListStaleFindingsRequest = {
  // Name substring to match against a finding's entity display name.
  query?: string;
  // Entity types to include. Omit to include every covered type.
  "entity-types"?: ContentDiagnosticsFilterType[];
  // When false (default), findings whose entity lives in a personal collection
  // are excluded. Results are always permission-filtered for the current user.
  "include-personal-collections"?: boolean;
  // Server-side sort. Omit for the backend default (detected-at asc).
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
