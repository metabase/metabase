import type { DashboardSubscription } from "../subscription";

import { createMockEntityId } from "./entity-id";
import { createMockUser } from "./user";

export const createMockDashboardSubscription = (
  opts?: Partial<DashboardSubscription>,
): DashboardSubscription => ({
  id: 1,
  name: "Pulse",
  archived: false,
  cards: [],
  channels: [],
  collection_id: null,
  collection_position: null,
  created_at: "2020-01-01T00:00:00.000Z",
  creator: createMockUser(),
  creator_id: 1,
  dashboard_id: 1,
  entity_id: createMockEntityId(),
  parameters: [],
  skip_if_empty: false,
  updated_at: "2020-01-01T00:00:00.000Z",
  ...opts,
});
