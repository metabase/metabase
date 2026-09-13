import { createMockMetadata } from "__support__/metadata";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type { State } from "metabase/redux/store";
import Question from "metabase-lib/v1/Question";
import type {
  CardId,
  QuestionDashboardCard,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockParameter,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

export const PARAMETER_ID = "parameter";

export const PARAMETER = createMockParameter({
  id: PARAMETER_ID,
  name: "Created At",
  slug: "created_at",
  type: "date/all-options",
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ORDERS_DATASET_QUERY = createMockStructuredDatasetQuery({
  query: { "source-table": ORDERS_ID },
});

export function createOrdersCard(id: CardId) {
  return createMockCard({
    id,
    name: `Orders ${id}`,
    dataset_query: ORDERS_DATASET_QUERY,
  });
}

export function createOrdersDashcard({
  id = 1,
  cardId = 1,
  seriesCardIds = [],
  parameterMappings,
}: {
  id?: number;
  cardId?: CardId;
  seriesCardIds?: CardId[];
  parameterMappings?: QuestionDashboardCard["parameter_mappings"];
} = {}) {
  return createMockDashboardCard({
    id,
    dashboard_tab_id: 1,
    card_id: cardId,
    card: createOrdersCard(cardId),
    series: seriesCardIds.map(createOrdersCard),
    parameter_mappings: parameterMappings,
  });
}

export function getOrdersQuestions(cardIds: CardId[]) {
  return Object.fromEntries(
    cardIds.map((id) => [id, new Question(createOrdersCard(id), metadata)]),
  );
}

export const MATCHING_TARGET: StructuredParameterDimensionTarget = [
  "dimension",
  ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
  { "stage-number": 0 },
];

export function createAutoWireState(dashcards: QuestionDashboardCard[]) {
  return createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
    dashboard: createMockDashboardState({
      dashboardId: 1,
      selectedTabId: 1,
      dashboards: {
        1: createMockStoreDashboard({
          id: 1,
          dashcards: dashcards.map(({ id }) => id),
          parameters: [PARAMETER],
        }),
      },
      dashcards: Object.fromEntries(
        dashcards.map((dashcard) => [dashcard.id, dashcard]),
      ),
    }),
  });
}

export function getAutoConnectToasts(state: State) {
  return state.undo.filter(({ actionLabel }) => actionLabel === "Auto-connect");
}
