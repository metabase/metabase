import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import {
  setupDashcardQueryEndpoints,
  setupDashcardQueryErrorEndpoint,
} from "__support__/server-mocks/dashcard";
import { createMockDashboardState, createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  getIcon,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { fetchDashboardCardData } from "metabase/dashboard/actions";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  Card,
  DashCardDataMap,
  Dashboard,
  DashboardCard,
} from "metabase-types/api";
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

const dashboardQuestion = createMockCard({
  id: 1,
  name: "Dashboard question",
  display: "scalar",
  dashboard_id: DASHBOARD_ID,
});

const collectionQuestion = createMockCard({
  id: 2,
  name: "Collection question",
  display: "scalar",
  dashboard_id: null,
});

function createDashcard(id: number, card: Card, row = 0): DashboardCard {
  return createMockDashboardCard({
    id,
    dashboard_id: DASHBOARD_ID,
    card,
    card_id: card.id,
    row,
    col: 0,
    size_x: 6,
    size_y: 4,
  });
}

function createDashcardData(dashcards: DashboardCard[]): DashCardDataMap {
  return Object.fromEntries(
    dashcards.map((dashcard) => [
      dashcard.id,
      {
        [String(dashcard.card_id)]: createMockDataset({
          data: createMockDatasetData({ rows: [[42]] }),
          status: "completed",
        }),
      },
    ]),
  );
}

function renderGrid(dashboard: Dashboard) {
  return (
    <MockDashboardContext
      dashboardId={dashboard.id}
      isEditing
      navigateToNewCardFromDashboard={jest.fn()}
      onChangeLocation={jest.fn()}
      downloadsEnabled={{ results: true }}
      slowCards={{}}
      reportAutoScrolledToDashcard={jest.fn()}
    >
      <DashboardGridConnected />
    </MockDashboardContext>
  );
}

interface SetupOpts {
  dashcards: DashboardCard[];
}

function setup({ dashcards }: SetupOpts) {
  const dashboard = createMockDashboard({ id: DASHBOARD_ID, dashcards });

  const storeInitialState = createMockState({
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashcards.map((dashcard) => dashcard.id),
        },
      },
      dashcards: Object.fromEntries(
        dashcards.map((dashcard) => [dashcard.id, dashcard]),
      ),
      dashcardData: createDashcardData(dashcards),
    }),
  });

  renderWithProviders(renderGrid(dashboard), { storeInitialState });
}

function getActionsPanels() {
  return screen.getAllByTestId("dashboardcard-actions-panel");
}

describe("DashboardGrid", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ width: 1200, height: 800 });
  });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  describe("remove action for dashboard questions", () => {
    it("shows the trash action for the only dashcard of a dashboard question", async () => {
      setup({ dashcards: [createDashcard(1, dashboardQuestion)] });

      const [panel] = getActionsPanels();
      expect(within(panel).getByLabelText("trash icon")).toBeInTheDocument();
      expect(queryIcon("close")).not.toBeInTheDocument();

      await userEvent.hover(getIcon("trash"));
      expect(await screen.findByText("Remove and trash")).toBeInTheDocument();
    });

    it("removes the only dashcard of a dashboard question when its trash action is clicked", async () => {
      setup({ dashcards: [createDashcard(1, dashboardQuestion)] });

      await userEvent.click(
        within(getActionsPanels()[0]).getByLabelText("trash icon"),
      );

      await waitFor(() =>
        expect(
          screen.queryByTestId("dashboardcard-actions-panel"),
        ).not.toBeInTheDocument(),
      );
    });

    it("shows the close action on every dashcard when a dashboard question is on the dashboard twice", async () => {
      setup({
        dashcards: [
          createDashcard(1, dashboardQuestion, 0),
          createDashcard(2, dashboardQuestion, 4),
        ],
      });

      const panels = getActionsPanels();
      expect(panels).toHaveLength(2);
      panels.forEach((panel) => {
        expect(within(panel).getByLabelText("close icon")).toBeInTheDocument();
      });
      expect(queryIcon("trash")).not.toBeInTheDocument();

      await userEvent.hover(within(panels[0]).getByLabelText("close icon"));
      expect(await screen.findByText("Remove")).toBeInTheDocument();
    });

    it("shows the trash action again once the other dashcard of a dashboard question is removed", async () => {
      setup({
        dashcards: [
          createDashcard(1, dashboardQuestion, 0),
          createDashcard(2, dashboardQuestion, 4),
        ],
      });

      expect(queryIcon("trash")).not.toBeInTheDocument();

      await userEvent.click(
        within(getActionsPanels()[1]).getByLabelText("close icon"),
      );

      await waitFor(() => expect(getActionsPanels()).toHaveLength(1));
      const panels = getActionsPanels();
      expect(
        within(panels[0]).getByLabelText("trash icon"),
      ).toBeInTheDocument();
      expect(queryIcon("close")).not.toBeInTheDocument();
    });

    it("shows the close action for the only dashcard of a collection question", () => {
      setup({ dashcards: [createDashcard(1, collectionQuestion)] });

      const [panel] = getActionsPanels();
      expect(within(panel).getByLabelText("close icon")).toBeInTheDocument();
      expect(queryIcon("trash")).not.toBeInTheDocument();
    });
  });
});

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

function setupWithFailingCard() {
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

describe("DashboardGrid dashcard errors", () => {
  // The Number chart loads on demand; load it up front so the render does not suspend mid-test.
  beforeAll(() => loadVisualizationComponents(["scalar"]));

  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  it("should show an error on a broken card and still show the other cards (metabase#13736)", async () => {
    const { store } = setupWithFailingCard();

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
