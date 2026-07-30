import type { CustomVizPlugin } from "metabase-types/api";

export const createMockCustomVizPlugin = (
  opts?: Partial<CustomVizPlugin>,
): CustomVizPlugin => ({
  id: 1,
  display_name: "My Viz",
  identifier: "my-viz",
  status: "active",
  enabled: true,
  icon: "icon.svg",
  error_message: null,
  bundle_hash: "0123456789abcdef",
  dev_only: false,
  warnings: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...opts,
});
