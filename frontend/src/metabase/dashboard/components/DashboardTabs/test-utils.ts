import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import { INITIAL_DASHBOARD_STATE } from "metabase/dashboard/constants";
import type { DashboardState } from "metabase-types/store";
import { getDefaultTab } from "metabase/dashboard/actions";

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

function createMockDashCard({
  dashCardId,
  tabId,
}: {
  dashCardId: number;
  tabId: number | undefined;
}) {
  return {
    id: dashCardId,
    dashboard_id: 1,
    dashboard_tab_id: tabId,
    card_id: 1,
    size_x: 4,
    size_y: 4,
    col: 0,
    row: 0,
    entity_id: "",
    created_at: "",
    updated_at: "",
    card: TEST_CARD,
  };
}

export const TEST_DASHBOARD_STATE: DashboardState = {
  ...INITIAL_DASHBOARD_STATE,
  dashboardId: 1,
  dashboards: {
    1: {
      id: 1,
      collection_id: 1,
      name: "",
      description: "",
      can_write: true,
      cache_ttl: null,
      auto_apply_filters: true,
      "last-edit-info": {
        id: 1,
        email: "",
        first_name: "",
        last_name: "",
        timestamp: "",
      },
      ordered_cards: [1, 2],
      ordered_tabs: [
        getDefaultTab({ tabId: 1, dashId: 1, name: "Page 1" }),
        getDefaultTab({ tabId: 2, dashId: 1, name: "Page 2" }),
        getDefaultTab({ tabId: 3, dashId: 1, name: "Page 3" }),
      ],
    },
  },
  dashcards: {
    1: createMockDashCard({ dashCardId: 1, tabId: 1 }),
    2: createMockDashCard({ dashCardId: 2, tabId: 2 }),
  },
};
