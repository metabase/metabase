import fetchMock from "fetch-mock";
import { assocIn } from "icepick";

import {
  createMockMetabotConversationDetail,
  setupCardDataset,
  setupGetMetabotConversationEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { metabotReducer } from "../../state";
import {
  createConversation,
  getMetabotInitialState,
} from "../../state/reducer-utils";

import { MetabotDashboardPage } from "./MetabotDashboardPage";

// Visualization pulls in the whole charting stack; stub it to a sentinel so we
// can unit test the page's data resolution and layout logic.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

const ROUTE = "/metabot/conversation/:convoId/dashboard/:dashboardId";
const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const DASHBOARD_ID = "d-1";

const datasetQuery = createMockStructuredDatasetQuery();

const conversationState = {
  queries: { "q-1": datasetQuery },
  charts: {
    "c-1": {
      chart_id: "c-1",
      query_id: "q-1",
      queries: [datasetQuery],
      visualization_settings: { chart_type: "bar" },
    },
  },
  dashboards: {
    [DASHBOARD_ID]: {
      dashboard_id: DASHBOARD_ID,
      name: "Ops overview",
      description: "Key ops charts.",
      tiles: [
        {
          chart_id: "c-1",
          title: "Venues by price",
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 6,
        },
        {
          query_id: "q-1",
          title: "All venues",
          row: 0,
          col: 12,
          size_x: 12,
          size_y: 6,
        },
      ],
    },
  },
};

const stateWithLocalConversation = () =>
  assocIn(
    getMetabotInitialState(),
    ["conversations", CONVERSATION_ID],
    createConversation({
      conversationId: CONVERSATION_ID,
      state: conversationState,
    }),
  );

const setup = ({
  metabotInitialState = getMetabotInitialState(),
}: {
  metabotInitialState?: ReturnType<typeof getMetabotInitialState>;
} = {}) => {
  setupCardDataset();

  return renderWithProviders(
    <Route path={ROUTE} element={<MetabotDashboardPage />} />,
    {
      withRouter: true,
      initialRoute: `/metabot/conversation/${CONVERSATION_ID}/dashboard/${DASHBOARD_ID}`,
      storeInitialState: createMockState({
        currentUser: createMockUser(),
        metabot: metabotInitialState,
      }),
      customReducers: { metabot: metabotReducer },
    },
  );
};

describe("MetabotDashboardPage", () => {
  it("renders the dashboard from a fetched conversation's state", async () => {
    setupGetMetabotConversationEndpoint(
      createMockMetabotConversationDetail({
        conversation_id: CONVERSATION_ID,
        state: conversationState,
      }),
    );
    setup();

    expect(await screen.findByText("Ops overview")).toBeInTheDocument();
    expect(screen.getByText("Key ops charts.")).toBeInTheDocument();
    expect(screen.getByText("Venues by price")).toBeInTheDocument();
    expect(screen.getByText("All venues")).toBeInTheDocument();
    expect(screen.getAllByTestId("metabot-dashboard-tile")).toHaveLength(2);
  });

  it("renders from redux conversation state without fetching the conversation", async () => {
    setup({ metabotInitialState: stateWithLocalConversation() });

    expect(await screen.findByText("Ops overview")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(
        `path:/api/metabot/conversations/${CONVERSATION_ID}`,
      ),
    ).toBe(false);
  });

  it("places tiles at their stored grid positions", async () => {
    setup({ metabotInitialState: stateWithLocalConversation() });

    const tiles = await screen.findAllByTestId("metabot-dashboard-tile");
    expect(tiles[0]).toHaveStyle({ gridColumn: "1 / span 12" });
    expect(tiles[1]).toHaveStyle({ gridColumn: "13 / span 12" });
  });

  it("shows an unavailable message when the dashboard is missing", async () => {
    setupGetMetabotConversationEndpoint(
      createMockMetabotConversationDetail({
        conversation_id: CONVERSATION_ID,
        state: {},
      }),
    );
    setup();

    expect(
      await screen.findByText("This dashboard is no longer available."),
    ).toBeInTheDocument();
  });
});
