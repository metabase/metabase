import type { DataApp } from "metabase-types/api";

export const createMockDataApp = (opts?: Partial<DataApp>): DataApp => ({
  id: 1,
  name: "sales",
  display_name: "Sales",
  bundle_path: "data_apps/sales/dist/index.js",
  enabled: true,
  resource_collection_id: 1,
  permission_group_id: 1,
  table_ids: [],
  has_user_permission_warnings: false,
  allowed_hosts: [],
  bundle_hash: "abc123",
  last_synced_sha: "0123456789abcdef",
  last_synced_at: "2024-01-01T00:00:00Z",
  sync_error: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...opts,
});
