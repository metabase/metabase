import type { DataApp } from "metabase-types/api";

export const createMockDataApp = (opts?: Partial<DataApp>): DataApp => ({
  id: 1,
  entity_id: "mOcKdAtAaPpEnTiTyIdXx",
  name: "sales",
  display_name: "Sales",
  description: null,
  version: 1,
  outdated: false,
  bundle_path: "dist/index.js",
  enabled: true,
  draft: false,
  resource_collection_id: 1,
  permission_group_id: 1,
  table_ids: [],
  has_user_permission_warnings: false,
  allowed_hosts: [],
  bundle_hash: "abc123",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...opts,
});
