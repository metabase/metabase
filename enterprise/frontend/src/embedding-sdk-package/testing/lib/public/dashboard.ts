import type { MetabaseDashboard } from "embedding-sdk-bundle/types/dashboard";

const MOCK_TIMESTAMP = "2024-01-01T00:00:00Z";

export function createMockDashboard(
  opts?: Partial<MetabaseDashboard>,
): MetabaseDashboard {
  return {
    id: 1,
    entity_id: "mockDashboardEntityId",
    created_at: MOCK_TIMESTAMP,
    updated_at: MOCK_TIMESTAMP,
    collection: null,
    name: "Dashboard",
    description: null,
    "last-edit-info": {
      id: 1,
      email: "user@example.com",
      first_name: "Testy",
      last_name: "Tableton",
      timestamp: MOCK_TIMESTAMP,
    },
    ...opts,
  };
}
