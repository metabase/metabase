import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockActionDashboardCard,
  createMockActionParameter,
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockDataset,
  createMockFieldSettings,
  createMockParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";

registerVisualizations();
registerDashboardVisualizations();

const DATABASE = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const ID_PARAMETER = createMockParameter({
  id: "dash-id",
  name: "ID",
  slug: "id",
  type: "id",
});

const SCORE_CARD = createMockCard({ id: 2, name: "Score", display: "scalar" });

const MODEL = createMockCard({ id: 3, name: "Scores model", type: "model" });

const ACTION_ID_PARAMETER = createMockActionParameter({
  id: "id-parameter",
  name: "ID",
  slug: "id",
  type: "number/=",
  target: ["variable", ["template-tag", "id"]],
});

const QUERY_ACTION = createMockQueryAction({
  id: 4,
  name: "Query action",
  model_id: MODEL.id,
  database_id: DATABASE.id,
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "UPDATE scores SET score = 999 WHERE id = {{id}}",
  }),
  parameters: [ACTION_ID_PARAMETER],
  visualization_settings: {
    fields: {
      [ACTION_ID_PARAMETER.id]: createMockFieldSettings({
        id: ACTION_ID_PARAMETER.id,
        fieldType: "number",
        inputType: "number",
        required: true,
      }),
    },
  },
});

const SCORE_DASHCARD = createMockDashboardCard({
  id: 10,
  card_id: SCORE_CARD.id,
  card: SCORE_CARD,
});

const ACTION_DASHCARD = createMockActionDashboardCard({
  id: 11,
  row: 4,
  // Action dashcards are virtual: the API sends them without a card id
  card_id: null,
  action_id: QUERY_ACTION.id,
  action: QUERY_ACTION,
  parameter_mappings: [
    { parameter_id: ID_PARAMETER.id, target: ACTION_ID_PARAMETER.target },
  ],
  visualization_settings: {
    ...createMockActionDashboardCard().visualization_settings,
    "button.label": "Update score",
  },
});

const DASHBOARD = createMockDashboard({
  id: 1,
  name: "Action dashboard",
  parameters: [ID_PARAMETER],
  dashcards: [SCORE_DASHCARD, ACTION_DASHCARD],
});

const EXECUTE_PATH = `path:/api/dashboard/${DASHBOARD.id}/dashcard/${ACTION_DASHCARD.id}/execute`;

function createScoreDataset(score: number) {
  return createMockDataset({
    data: {
      rows: [[score]],
      cols: [createMockColumn({ name: "score", display_name: "Score" })],
    },
  });
}

function setup() {
  let storedScore = 0;

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupDashboardEndpoints(DASHBOARD);
  setupDashboardQueryMetadataEndpoint(
    DASHBOARD,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );
  setupCollectionsEndpoints({ collections: [] });
  setupCardsEndpoints([SCORE_CARD, MODEL]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([QUERY_ACTION]);
  fetchMock.post(
    `path:/api/dashboard/${DASHBOARD.id}/dashcard/${SCORE_DASHCARD.id}/card/${SCORE_CARD.id}/query`,
    () => createScoreDataset(storedScore),
    { name: "score-query" },
  );
  fetchMock.post(
    EXECUTE_PATH,
    () => {
      storedScore = 999;
      return { "rows-updated": [1] };
    },
    { name: "execute" },
  );

  renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${DASHBOARD.id}?id=1`,
      withRouter: true,
      withUndos: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );
}

describe("DashboardApp > actions", () => {
  it("shows the new result of a loaded card after running a query action mapped to a dashboard filter (metabase#32974)", async () => {
    setup();
    await waitForDashboardToLoad();

    // The score card comes first on the grid
    const scoreCard = () => screen.getAllByTestId("dashcard")[0];
    expect(
      await within(scoreCard()).findByTestId("scalar-value"),
    ).toHaveTextContent("0");
    expect(fetchMock.callHistory.calls("score-query")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Update score" }));
    const modal = await screen.findByTestId("action-parameters-input-modal");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Query action" }),
    );

    expect(
      await screen.findByText("Query action ran successfully"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("action-parameters-input-modal"),
    ).not.toBeInTheDocument();
    const executeCall = fetchMock.callHistory.lastCall("execute");
    const executeBody: unknown = JSON.parse(String(executeCall?.options.body));
    expect(executeBody).toEqual({
      modelId: null,
      parameters: { [ACTION_ID_PARAMETER.id]: 1 },
    });
    await waitFor(() =>
      expect(within(scoreCard()).getByTestId("scalar-value")).toHaveTextContent(
        "999",
      ),
    );
  });
});
