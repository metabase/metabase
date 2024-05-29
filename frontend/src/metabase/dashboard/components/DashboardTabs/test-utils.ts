import { getDefaultTab } from "metabase/dashboard/actions";
import { INITIAL_DASHBOARD_STATE } from "metabase/dashboard/constants";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import type { DashboardState } from "metabase-types/store";

const TEST_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  },
});

export const TEST_DASHBOARD_STATE: DashboardState = {
  ...INITIAL_DASHBOARD_STATE,
  dashboardId: 1,
  dashboards: {
    1: {
      id: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      collection_id: 1,
      name: "",
      description: "",
      can_write: true,
      cache_ttl: null,
      auto_apply_filters: true,
      archived: false,
      "last-edit-info": {
        id: 1,
        email: "",
        first_name: "",
        last_name: "",
        timestamp: "",
      },
      last_used_param_values: {},
      dashcards: [1, 2],
      tabs: [
        getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" }),
        getDefaultTab({ tabId: 2, dashId: 1, name: "Tab 2" }),
        getDefaultTab({ tabId: 3, dashId: 1, name: "Tab 3" }),
      ],
      public_uuid: null,
      enable_embedding: false,
      initially_published_at: null,
      width: "fixed",
    },
  },
  dashcards: {
    1: createMockDashboardCard({
      id: 1,
      dashboard_id: 1,
      dashboard_tab_id: 1,
      card_id: TEST_CARD.id,
      card: TEST_CARD,
    }),
    2: createMockDashboardCard({
      id: 2,
      dashboard_id: 1,
      dashboard_tab_id: 2,
      card_id: TEST_CARD.id,
      card: TEST_CARD,
    }),
  },
  dashcardData: {
    1: { 1: null },
    2: { 1: null },
  },
};
