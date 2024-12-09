import type { Alert, AlertCard } from "../alert";
import type { Channel } from "../notifications";

import { createMockEntityId } from "./entity-id";
import { createMockUserInfo } from "./user";

export const createMockAlert = (opts?: Partial<Alert>): Alert => ({
  id: 1,
  name: "Alert",
  alert_above_goal: false,
  alert_condition: "rows",
  alert_first_only: false,
  skip_if_empty: false,

  card: createMockAlertCard(),
  parameters: [],
  channels: [createMockChannel()],

  dashboard_id: null,
  collection_id: null,
  collection_position: null,

  can_write: true,
  archived: false,

  entity_id: createMockEntityId(),

  creator_id: 1,
  creator: createMockUserInfo(),

  created_at: "2020-01-01T00:00:00.000Z",
  updated_at: "2020-01-01T00:00:00.000Z",

  ...opts,
});

export const createMockChannel = (opts?: Partial<Channel>): Channel => ({
  channel_type: "email",
  details: {},
  enabled: true,
  recipients: [],
  schedule_day: null,
  schedule_frame: null,
  schedule_hour: null,
  schedule_type: "daily",
  ...opts,
});

export function createMockAlertCard(opts?: Partial<AlertCard>): AlertCard {
  return {
    id: 1,
    include_csv: false,
    include_xls: false,
    ...opts,
  };
}
