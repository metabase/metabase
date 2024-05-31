import type {
  Dashboard,
  DashboardTab,
  QuestionDashboardCard,
  VirtualCard,
  ActionDashboardCard,
  VirtualDashboardCard,
  DashboardQueryMetadata,
} from "metabase-types/api";

import { createMockCard } from "./card";

export const createMockDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  collection_id: null,
  name: "Dashboard",
  dashcards: [],
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
  last_used_param_values: {},
  auto_apply_filters: true,
  archived: false,
  public_uuid: null,
  enable_embedding: false,
  embedding_params: null,
  initially_published_at: null,
  width: "fixed",
  ...opts,
});

export const createMockDashboardTab = (
  opts?: Partial<DashboardTab>,
): DashboardTab => ({
  id: 1,
  dashboard_id: 1,
  name: "Tab 1",
  entity_id: "abc_123",
  created_at: "2020-01-01T12:30:30.000000",
  updated_at: "2020-01-01T12:30:30.000000",
  ...opts,
});

export const createMockDashboardCard = (
  opts?: Partial<QuestionDashboardCard>,
): QuestionDashboardCard => ({
  id: 1,
  dashboard_id: 1,
  dashboard_tab_id: null,
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
  parameter_mappings: [],
  ...opts,
});

export const createMockVirtualCard = (
  opts?: Partial<VirtualCard>,
): VirtualCard => ({
  id: 1,
  dataset_query: {},
  display: "text",
  name: null,
  visualization_settings: {},
  archived: false,
  ...opts,
});

export const createMockActionDashboardCard = (
  opts?: Partial<ActionDashboardCard>,
): ActionDashboardCard => ({
  ...createMockDashboardCard(),
  action_id: 1,
  action: undefined,
  card: createMockCard({ display: "action" }),
  visualization_settings: {
    "button.label": "Please click me",
    "button.variant": "primary",
    actionDisplayType: "button",
    virtual_card: createMockVirtualCard({ display: "action" }),
  },
  ...opts,
});

type VirtualDashboardCardOpts = Partial<
  Omit<VirtualDashboardCard, "visualization_settings">
> & {
  visualization_settings?: Partial<
    VirtualDashboardCard["visualization_settings"]
  >;
};

export const createMockVirtualDashCard = (
  opts?: VirtualDashboardCardOpts,
): VirtualDashboardCard => {
  const card = createMockVirtualCard(
    opts?.card || opts?.visualization_settings?.virtual_card,
  );
  return {
    id: 1,
    dashboard_id: 1,
    dashboard_tab_id: null,
    col: 0,
    row: 0,
    size_x: 1,
    size_y: 1,
    entity_id: "abc_123",
    created_at: "2020-01-01T12:30:30.000000",
    updated_at: "2020-01-01T12:30:30.000000",
    card_id: null,
    card,
    ...opts,
    visualization_settings: {
      ...opts?.visualization_settings,
      virtual_card: card,
    },
  };
};

export const createMockTextDashboardCard = ({
  text,
  ...opts
}: VirtualDashboardCardOpts & { text?: string } = {}): VirtualDashboardCard =>
  createMockVirtualDashCard({
    ...opts,
    card: createMockVirtualCard({ display: "text" }),
    visualization_settings: {
      text: text ?? "Body Text",
    },
  });

export const createMockHeadingDashboardCard = (
  opts?: VirtualDashboardCardOpts & { text?: string },
): VirtualDashboardCard =>
  createMockVirtualDashCard({
    ...opts,
    card: createMockVirtualCard({ display: "heading" }),
    visualization_settings: {
      text: opts?.text ?? "Heading Text",
    },
  });

export const createMockLinkDashboardCard = ({
  visualization_settings,
  ...opts
}: VirtualDashboardCardOpts & { url?: string } = {}): VirtualDashboardCard =>
  createMockVirtualDashCard({
    ...opts,
    card: createMockVirtualCard({ display: "link" }),
    visualization_settings: {
      link: {
        ...visualization_settings?.link,
        url: opts?.url ?? visualization_settings?.link?.url ?? "Link Text",
      },
    },
  });

export const createMockPlaceholderDashboardCard = ({
  visualization_settings,
  ...opts
}: VirtualDashboardCardOpts = {}): VirtualDashboardCard =>
  createMockVirtualDashCard({
    ...opts,
    card: createMockVirtualCard({ display: "placeholder" }),
  });

export const createMockDashboardQueryMetadata = (
  opts?: Partial<DashboardQueryMetadata>,
): DashboardQueryMetadata => ({
  databases: [],
  tables: [],
  fields: [],
  cards: [],
  dashboards: [],
  ...opts,
});
