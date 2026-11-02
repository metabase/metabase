import type {
  DataApp,
  DataAppGroup,
  DataAppGroupPermissionWarning,
  DataAppMissingTable,
} from "metabase-types/api";

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
  resource_collection_id: 1,
  allowed_hosts: [],
  bundle_hash: "abc123",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...opts,
});

export const createMockDataAppGroup = (
  opts?: Partial<DataAppGroup>,
): DataAppGroup => ({
  id: 1,
  name: "Support",
  member_count: 0,
  ...opts,
});

export const createMockDataAppMissingTable = (
  opts?: Partial<DataAppMissingTable>,
): DataAppMissingTable => ({
  id: 1,
  name: "Orders",
  schema: "public",
  database_id: 1,
  database_name: "Shop",
  ...opts,
});

export const createMockDataAppGroupPermissionWarning = (
  opts?: Partial<DataAppGroupPermissionWarning>,
): DataAppGroupPermissionWarning => ({
  group_id: 1,
  missing_tables: [createMockDataAppMissingTable()],
  ...opts,
});
