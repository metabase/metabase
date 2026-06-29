// Types for the Content Diagnostics serve API. MUST stay in sync with the
// response shapes in:
// enterprise/backend/src/metabase_enterprise/content_diagnostics/api.clj

import type { CollectionId } from "./collection";
import type { PaginationRequest } from "./pagination";
import type { UserId } from "./user";

export const CONTENT_DIAGNOSTICS_FINDING_TYPES = ["stale"] as const;
export type ContentDiagnosticsFindingType =
  (typeof CONTENT_DIAGNOSTICS_FINDING_TYPES)[number];

export const CONTENT_DIAGNOSTICS_ENTITY_TYPES = ["card", "dashboard"] as const;
export type ContentDiagnosticsEntityType =
  (typeof CONTENT_DIAGNOSTICS_ENTITY_TYPES)[number];

// The full set of entity types Content Diagnostics is scoped to surface in the
// UI (entity-type filter). Broader than the types the stale checker emits today
// (card/dashboard) — the rest light up as their backends land.
export const CONTENT_DIAGNOSTICS_FILTER_TYPES = [
  "card",
  "dashboard",
  "document",
  "collection",
  "transform",
] as const;
export type ContentDiagnosticsFilterType =
  (typeof CONTENT_DIAGNOSTICS_FILTER_TYPES)[number];

// Persisted (last-used) filter state, stored per finding-type tab via the
// `content_diagnostics` user-key-value namespace. Snake_case to match the
// stored JSON shape.
export type ContentDiagnosticsUserParams = {
  entity_types?: ContentDiagnosticsFilterType[];
  include_personal_collections?: boolean;
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
  threshold_days?: number;
};

export type ContentDiagnosticsFinding = {
  id: number;
  finding_type: ContentDiagnosticsFindingType;
  entity_type: ContentDiagnosticsEntityType;
  entity_id: number;
  detected_at: string;
  entity_display_name: string | null;
  details: ContentDiagnosticsFindingDetails;
};

// Topline of a synchronous scan run (demo/dev `POST /scan`).
export type ContentDiagnosticsScanResult = {
  scan_id: string;
  finding_count: number;
  entities_scanned: number;
  duration_ms: number;
};

export type ListStaleFindingsRequest = PaginationRequest;

export type ListStaleFindingsResponse = {
  data: ContentDiagnosticsFinding[];
  total: number;
  limit: number | null;
  offset: number | null;
  last_scan_at: string | null;
};
