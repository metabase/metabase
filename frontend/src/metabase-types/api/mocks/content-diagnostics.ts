import type {
  ContentDiagnosticsCollection,
  ContentDiagnosticsDuplicateEntity,
  ContentDiagnosticsDuplicatedFinding,
  ContentDiagnosticsDuplicatedFindingDetails,
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingDetails,
  ContentDiagnosticsSlowFinding,
  ContentDiagnosticsSlowFindingDetails,
  ContentDiagnosticsStaleFinding,
  ContentDiagnosticsStaleFindingDetails,
  ContentDiagnosticsUser,
  ListDuplicatedFindingsResponse,
  ListImbalancedFindingsResponse,
  ListSlowFindingsResponse,
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
    namespace: null,
    effective_ancestors: [],
    ...opts,
  };
}

export function createMockContentDiagnosticsStaleFinding(
  opts?: Partial<Omit<ContentDiagnosticsStaleFinding, "details">> & {
    details?: Partial<ContentDiagnosticsStaleFindingDetails>;
  },
): ContentDiagnosticsStaleFinding {
  return {
    id: 1,
    finding_type: "stale",
    entity_type: "card",
    entity_id: 10,
    detected_at: "2026-06-01T00:00:00Z",
    entity_display_name: "Stale question",
    created_at: "2026-01-01T00:00:00Z",
    can_write: true,
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
    data: [createMockContentDiagnosticsStaleFinding()],
    total: 1,
    limit: 25,
    offset: 0,
    last_scan_at: "2026-06-01T00:00:00Z",
    ...opts,
  };
}

export function createMockContentDiagnosticsSlowFinding(
  opts?: Partial<Omit<ContentDiagnosticsSlowFinding, "details">> & {
    details?: Partial<ContentDiagnosticsSlowFindingDetails>;
  },
): ContentDiagnosticsSlowFinding {
  return {
    id: 1,
    finding_type: "slow",
    entity_type: "card",
    entity_id: 10,
    detected_at: "2026-06-01T00:00:00Z",
    entity_display_name: "Slow question",
    created_at: "2026-01-01T00:00:00Z",
    can_write: true,
    duration_ms: 5000,
    ...opts,
    details: {
      collection: createMockContentDiagnosticsCollection(),
      description: null,
      owner: null,
      creator: createMockContentDiagnosticsUser(),
      view_count: 0,
      threshold_ms: 1000,
      ...opts?.details,
    },
  };
}

export function createMockListSlowFindingsResponse(
  opts?: Partial<ListSlowFindingsResponse>,
): ListSlowFindingsResponse {
  return {
    data: [createMockContentDiagnosticsSlowFinding()],
    total: 1,
    limit: 25,
    offset: 0,
    last_scan_at: "2026-06-01T00:00:00Z",
    ...opts,
  };
}

export function createMockContentDiagnosticsDuplicateEntity(
  opts?: Partial<ContentDiagnosticsDuplicateEntity>,
): ContentDiagnosticsDuplicateEntity {
  return {
    id: 11,
    name: "Duplicated question",
    entity_type: "card",
    view_count: 0,
    ...opts,
  };
}

export function createMockContentDiagnosticsDuplicatedFinding(
  opts?: Partial<Omit<ContentDiagnosticsDuplicatedFinding, "details">> & {
    details?: Partial<ContentDiagnosticsDuplicatedFindingDetails>;
  },
): ContentDiagnosticsDuplicatedFinding {
  return {
    id: 1,
    finding_type: "duplicated",
    entity_type: "card",
    entity_id: 10,
    detected_at: "2026-06-01T00:00:00Z",
    entity_display_name: "Duplicated question",
    created_at: "2026-01-01T00:00:00Z",
    can_write: true,
    duplicate_count: 1,
    ...opts,
    details: {
      collection: createMockContentDiagnosticsCollection(),
      description: null,
      owner: null,
      creator: createMockContentDiagnosticsUser(),
      view_count: 0,
      normalized_name: "duplicated question",
      duplicate_entities: [createMockContentDiagnosticsDuplicateEntity()],
      ...opts?.details,
    },
  };
}

export function createMockListDuplicatedFindingsResponse(
  opts?: Partial<ListDuplicatedFindingsResponse>,
): ListDuplicatedFindingsResponse {
  return {
    data: [createMockContentDiagnosticsDuplicatedFinding()],
    total: 1,
    limit: 25,
    offset: 0,
    last_scan_at: "2026-06-01T00:00:00Z",
    ...opts,
  };
}

export function createMockContentDiagnosticsImbalancedFinding(
  opts?: Partial<Omit<ContentDiagnosticsImbalancedFinding, "details">> & {
    details?: Partial<ContentDiagnosticsImbalancedFindingDetails>;
  },
): ContentDiagnosticsImbalancedFinding {
  return {
    id: 1,
    finding_type: "crowded",
    entity_type: "collection",
    entity_id: 10,
    detected_at: "2026-06-01T00:00:00Z",
    entity_display_name: "Crowded collection",
    created_at: "2026-01-01T00:00:00Z",
    can_write: true,
    content_count: 101,
    ...opts,
    details: {
      collection: createMockContentDiagnosticsCollection(),
      description: null,
      owner: null,
      creator: createMockContentDiagnosticsUser(),
      view_count: 0,
      threshold: 100,
      unit: "items",
      ...opts?.details,
    },
  };
}

export function createMockListImbalancedFindingsResponse(
  opts?: Partial<ListImbalancedFindingsResponse>,
): ListImbalancedFindingsResponse {
  return {
    data: [createMockContentDiagnosticsImbalancedFinding()],
    total: 1,
    limit: 25,
    offset: 0,
    last_scan_at: "2026-06-01T00:00:00Z",
    ...opts,
  };
}
