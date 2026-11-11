import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { createMockDashboardState, createMockState } from "__support__/state";
import {
  getIcon,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerVisualizations } from "metabase/visualizations/register";
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
} from "metabase-types/api/mocks";

import { DashboardGridConnected } from "./DashboardGrid";

registerVisualizations();

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
      dashboard={dashboard}
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

function setup(dashcards: DashboardCard[]) {
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

  const { rerender } = renderWithProviders(renderGrid(dashboard), {
    storeInitialState,
  });

  const rerenderWithDashcards = (nextDashcards: DashboardCard[]) =>
    rerender(
      renderGrid(
        createMockDashboard({ id: DASHBOARD_ID, dashcards: nextDashcards }),
      ),
    );

  return { rerenderWithDashcards };
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
      setup([createDashcard(1, dashboardQuestion)]);

      const [panel] = getActionsPanels();
      expect(within(panel).getByLabelText("trash icon")).toBeInTheDocument();
      expect(queryIcon("close")).not.toBeInTheDocument();

      await userEvent.hover(getIcon("trash"));
      expect(await screen.findByText("Remove and trash")).toBeInTheDocument();
    });

    it("shows the close action on every dashcard when a dashboard question is on the dashboard twice", async () => {
      setup([
        createDashcard(1, dashboardQuestion, 0),
        createDashcard(2, dashboardQuestion, 4),
      ]);

      const panels = getActionsPanels();
      expect(panels).toHaveLength(2);
      panels.forEach((panel) => {
        expect(within(panel).getByLabelText("close icon")).toBeInTheDocument();
      });
      expect(queryIcon("trash")).not.toBeInTheDocument();

      await userEvent.hover(within(panels[0]).getByLabelText("close icon"));
      expect(await screen.findByText("Remove")).toBeInTheDocument();
    });

    it("shows the trash action again once only one dashcard of a dashboard question remains", () => {
      const first = createDashcard(1, dashboardQuestion, 0);
      const second = createDashcard(2, dashboardQuestion, 4);
      const { rerenderWithDashcards } = setup([first, second]);

      expect(queryIcon("trash")).not.toBeInTheDocument();

      rerenderWithDashcards([first]);

      const panels = getActionsPanels();
      expect(panels).toHaveLength(1);
      expect(
        within(panels[0]).getByLabelText("trash icon"),
      ).toBeInTheDocument();
      expect(queryIcon("close")).not.toBeInTheDocument();
    });

    it("shows the close action for the only dashcard of a collection question", () => {
      setup([createDashcard(1, collectionQuestion)]);

      const [panel] = getActionsPanels();
      expect(within(panel).getByLabelText("close icon")).toBeInTheDocument();
      expect(queryIcon("trash")).not.toBeInTheDocument();
    });
  });
});
