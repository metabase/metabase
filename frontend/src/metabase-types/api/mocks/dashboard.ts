import {
  Dashboard,
  DashboardOrderedCard,
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
  ...opts,
});

export const createMockDashboardOrderedCard = (
  opts?: Partial<DashboardOrderedCard>,
): DashboardOrderedCard => ({
  id: 1,
  dashboard_id: 1,
  size_x: 1,
  size_y: 1,
  visualization_settings: {},
  justAdded: false,
  card_id: 1,
  card: createMockCard(),
  parameter_mappings: [],
  ...opts,
});

export const createMockActionDashboardCard = (
  opts?: Partial<ActionDashboardCard>,
): ActionDashboardCard => ({
  ...createMockDashboardOrderedCard(),
  action: undefined,
  card: createMockCard(),
  visualization_settings: {
    "button.label": "Please click me",
    "button.variant": "primary",
    actionDisplayType: "button",
    virtual_card: createMockCard({ display: "action" }),
  },
  ...opts,
});
