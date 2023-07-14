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

export const createMockTextDashboardCard = (
  opts?: Partial<DashboardOrderedCard> & { text?: string },
): DashboardOrderedCard => ({
  ...createMockDashboardCardWithVirtualCard({
    visualization_settings: {
      text: opts?.text ?? "Body Text",
      virtual_card: {
        archived: false,
        dataset_query: {},
        display: "text",
        name: "",
        visualization_settings: {},
      } as VirtualCard,
    },
  }),
  ...opts,
});

export const createMockHeadingDashboardCard = (
  opts?: Partial<DashboardOrderedCard> & { text?: string },
): DashboardOrderedCard => ({
  ...createMockDashboardCardWithVirtualCard({
    visualization_settings: {
      text: opts?.text ?? "Heading Text",
      virtual_card: {
        archived: false,
        dataset_query: {},
        display: "heading",
        name: "",
        visualization_settings: {},
      } as VirtualCard,
    },
  }),
  ...opts,
});

export const createMockLinkDashboardCard = (
  opts?: Partial<DashboardOrderedCard> & { url?: string },
): DashboardOrderedCard => ({
  ...createMockDashboardCardWithVirtualCard({
    id: 1,
    visualization_settings: {
      link: {
        url: opts?.url ?? "Link url",
      },
      virtual_card: {
        archived: false,
        dataset_query: {},
        display: "link",
        name: "",
        visualization_settings: {},
      } as VirtualCard,
    },
  }),
  ...opts,
});

export const createMockDashboardCardWithVirtualCard = (
  opts?: Partial<DashboardOrderedCard>,
): DashboardOrderedCard => ({
  ...createMockDashboardOrderedCard(),
  card: {
    query_average_duration: null,
    display: opts?.visualization_settings?.virtual_card?.display ?? "text",
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
