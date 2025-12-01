import type { MetabaseInfo } from "metabase-types/api";

export const createMockMetabaseInfo = (
  opts?: Partial<MetabaseInfo>,
): MetabaseInfo => ({
  "application-database": "h2",
  "application-database-details": {},
  databases: [],
  "hosting-env": "unknown",
  "run-mode": "dev",
  settings: {},
  version: {
    date: "2024-01-01",
    hash: "abc123",
    src_hash: "def456",
    tag: "v1.0.0",
  },
  ...opts,
});
