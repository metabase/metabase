import {
  setupDashcardQueryEndpoints,
  setupDashcardQueryErrorEndpoint,
} from "__support__/server-mocks/dashcard";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { fetchDashboardCardData } from "metabase/dashboard/actions";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DashboardGridConnected } from "./DashboardGrid";

registerVisualizations();
registerDashboardVisualizations();

const DASHBOARD_ID = 1;

const FAILING_DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: 1,
  dashboard_id: DASHBOARD_ID,
  card: createMockCard({ id: 1, name: "Failing card", display: "scalar" }),
  col: 0,
});

const SUCCESSFUL_DASHCARD = createMockDashboardCard({
  id: 2,
  card_id: 2,
  dashboard_id: DASHBOARD_ID,
  card: createMockCard({ id: 2, name: "Successful card", display: "scalar" }),
  col: 12,
});

const DASHCARDS = [FAILING_DASHCARD, SUCCESSFUL_DASHCARD];

function setup() {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    dashcards: DASHCARDS,
  });

  setupDashcardQueryErrorEndpoint(DASHBOARD_ID, FAILING_DASHCARD);
  setupDashcardQueryEndpoints(
    DASHBOARD_ID,
    SUCCESSFUL_DASHCARD,
    createMockDataset({
      data: createMockDatasetData({
        rows: [[18760]],
        cols: [createMockNumericColumn({ name: "count" })],
      }),
    }),
  );

  const { store } = renderWithProviders(
    <MockDashboardContext
      dashboardId={DASHBOARD_ID}
      navigateToNewCardFromDashboard={null}
      slowCards={{}}
    >
      <DashboardGridConnected width={1200} />
    </MockDashboardContext>,
    {
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: {
              ...dashboard,
              dashcards: DASHCARDS.map((dashcard) => dashcard.id),
            },
          },
          dashcards: Object.fromEntries(
            DASHCARDS.map((dashcard) => [dashcard.id, dashcard]),
          ),
        }),
      },
    },
  );

  return { store };
}

const getDashcard = (dashcardId: number) => {
  const index = DASHCARDS.findIndex((dashcard) => dashcard.id === dashcardId);
  return screen.getAllByTestId("dashcard-container")[index];
};

describe("DashboardGrid", () => {
  // The Number chart loads on demand; load it up front so the render does not suspend mid-test.
  beforeAll(() => loadVisualizationComponents(["scalar"]));

  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("should show an error on a broken card and still show the other cards (metabase#13736)", async () => {
    const { store } = setup();

    await act(() => store.dispatch(fetchDashboardCardData()));

    expect(
      await within(getDashcard(FAILING_DASHCARD.id)).findByText(
        "There was a problem displaying this chart.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(getDashcard(SUCCESSFUL_DASHCARD.id)).findByText("18,760"),
    ).toBeInTheDocument();
    expect(
      within(getDashcard(SUCCESSFUL_DASHCARD.id)).queryByText(
        "There was a problem displaying this chart.",
      ),
    ).not.toBeInTheDocument();
  });
});
