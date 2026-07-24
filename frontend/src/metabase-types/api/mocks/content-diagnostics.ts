import type {
  ContentDiagnosticsCollection,
  ContentDiagnosticsFinding,
  ContentDiagnosticsUser,
  ListStaleFindingsResponse,
} from "metabase-types/api";

export function createMockContentDiagnosticsUser(
  opts?: Partial<Extract<ContentDiagnosticsUser, { type: "user" }>>,
): ContentDiagnosticsUser {
  return {
    type: "user",
    id: 1,
    name: "Test User",
    email: "user@metabase.test",
    ...opts,
  };
}

export function createMockContentDiagnosticsCollection(
  opts?: Partial<ContentDiagnosticsCollection>,
): ContentDiagnosticsCollection {
  return {
    id: 1,
    name: "First collection",
    effective_ancestors: [],
    ...opts,
  };
}

export function createMockContentDiagnosticsFinding(
  opts?: Partial<ContentDiagnosticsFinding>,
): ContentDiagnosticsFinding {
  return {
    id: 1,
    finding_type: "stale",
    entity_type: "card",
    entity_id: 10,
    detected_at: "2026-06-01T00:00:00Z",
    entity_display_name: "Stale question",
    created_at: "2026-01-01T00:00:00Z",
    last_active_at: "2026-03-01T00:00:00Z",
    ...opts,
    details: {
      collection: createMockContentDiagnosticsCollection(),
      description: null,
      owner: null,
      creator: createMockContentDiagnosticsUser(),
      view_count: 0,
      threshold_days: 90,
      ...opts?.details,
    },
  };
}

export function createMockListStaleFindingsResponse(
  opts?: Partial<ListStaleFindingsResponse>,
): ListStaleFindingsResponse {
  return {
    data: [createMockContentDiagnosticsFinding()],
    total: 1,
    limit: 25,
    offset: 0,
    last_scan_at: "2026-06-01T00:00:00Z",
    ...opts,
  };
}
