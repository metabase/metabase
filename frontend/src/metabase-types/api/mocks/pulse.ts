import type { BaseEntityId, DashboardSubscription } from "metabase-types/api";

import { createMockUser } from "./user";

export const createMockPulse = (
  opts?: Partial<DashboardSubscription>,
): DashboardSubscription => ({
  name: "Pulse",
  cards: [],
  channels: [],
  parameters: [],
  archived: false,
  can_write: true,
  collection_id: null,
  collection_position: null,
  created_at: "2022-01-01T00:00:00Z",
  creator: createMockUser(),
  creator_id: createMockUser().id,
  dashboard_id: 1,
  disable_links: false,
  entity_id: "" as BaseEntityId,
  skip_if_empty: false,
  id: 1,
  updated_at: "2022-01-01T00:00:00Z",
  ...opts,
});
