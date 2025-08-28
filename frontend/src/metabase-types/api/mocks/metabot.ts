import type { MetabotInfo } from "../metabot";

export const createMockMetabotInfo = (
  opts?: Partial<MetabotInfo>,
): MetabotInfo => ({
  id: 1,
  name: "Metabot",
  entity_id: "metabot",
  description: "",
  use_verified_content: false,
  collection_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});
