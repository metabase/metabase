import {
  Card,
  Dashboard,
  DashboardOrderedCard,
  VirtualCard,
  ActionDashboardCard,
} from "metabase-types/api";
import { createMockCard } from "./card";

export const createMockDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  collection_id: null,
  name: "Dashboard",
  ordered_cards: [],
  can_write: true,
  description: "",
  cache_ttl: null,
  "last-edit-info": {
    id: 1,
    email: "admin@metabase.com",
    first_name: "John",
    last_name: "Doe",
    timestamp: "2018-01-01",
  },
  auto_apply_filters: true,
  ...opts,
});

export const createMockDashboardOrderedCard = (
  opts?: Partial<DashboardOrderedCard>,
): DashboardOrderedCard => ({
  id: 1,
  dashboard_id: 1,
  col: 0,
  row: 0,
  card_id: 1,
  size_x: 1,
  size_y: 1,
  entity_id: "abc_123",
  visualization_settings: {},
  card: createMockCard(),
  created_at: "2020-01-01T12:30:30.000000",
  updated_at: "2020-01-01T12:30:30.000000",
  justAdded: false,
  parameter_mappings: [],
  ...opts,
});

export const createMockActionDashboardCard = (
  opts?: Partial<ActionDashboardCard>,
): ActionDashboardCard => ({
  ...createMockDashboardOrderedCard(),
  action: undefined,
  card: createMockCard({ display: "action" }),
  visualization_settings: {
    "button.label": "Please click me",
    "button.variant": "primary",
    actionDisplayType: "button",
    virtual_card: createMockCard({ display: "action" }),
  },
  ...opts,
});

export const createMockDashboardCardWithVirtualCard = (
  opts?: Partial<DashboardOrderedCard>,
): DashboardOrderedCard => ({
  ...createMockDashboardOrderedCard(),
  card: {
    query_average_duration: null,
  } as Card,
  card_id: null,
  visualization_settings: {
    virtual_card: {
      archived: false,
      dataset_query: {},
      display: "text",
      name: "",
      visualization_settings: {},
    } as VirtualCard,
  },
  ...opts,
});
