import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import {
  act,
  getIcon,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { DashCardDataMap } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import type { DashCardProps } from "./DashCard";
import { DashCard } from "./DashCard";

registerVisualizations();

const testDashboard = createMockDashboard();

const tableDashcard = createMockDashboardCard({
  card: createMockCard({
    name: "My Card",
    description: "This is a table card",
    display: "table",
  }),
});

const tableDashcardData = {
  [tableDashcard.id]: {
    [tableDashcard.card.id]: createMockDataset({
      data: createMockDatasetData({
        rows: [["Davy Crocket"], ["Daniel Boone"]],
      }),
      database_id: 1,
      context: "dashboard",
      running_time: 50,
      row_count: 2,
      status: "completed",
    }),
  },
};

const erroringDashcardData = {
  [tableDashcard.id]: {
    [tableDashcard.card.id]: createMockDataset({
      data: createMockDatasetData({
        rows: [],
        cols: [],
      }),
      database_id: 1,
      context: "dashboard",
      running_time: 50,
      row_count: 0,
      status: "error",
      error: {
        status: 400,
      },
    }),
  },
};

function setup({
  dashboard = testDashboard,
  dashcard = tableDashcard,
  dashcardData = tableDashcardData,
  ...props
}: Partial<DashCardProps> & { dashcardData?: DashCardDataMap } = {}) {
  const onReplaceCard = jest.fn();

  renderWithProviders(
    <DashCard
      dashboard={dashboard}
      dashcard={dashcard}
      gridItemWidth={4}
      totalNumGridCols={24}
      slowCards={{}}
      isEditing={false}
      isEditingParameter={false}
      {...props}
      onAddSeries={jest.fn()}
      onReplaceCard={onReplaceCard}
      isTrashedOnRemove={false}
      onRemove={jest.fn()}
      markNewCardSeen={jest.fn()}
      navigateToNewCardFromDashboard={jest.fn()}
      onReplaceAllDashCardVisualizationSettings={jest.fn()}
      onUpdateVisualizationSettings={jest.fn()}
      showClickBehaviorSidebar={jest.fn()}
      onChangeLocation={jest.fn()}
      downloadsEnabled
      autoScroll={false}
      reportAutoScrolledToDashcard={jest.fn()}
    />,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashcardData,
          dashcards: {
            [tableDashcard.id]: tableDashcard,
          },
        }),
      },
    },
  );

  return { onReplaceCard };
}

describe("DashCard", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    setupLastDownloadFormatEndpoints();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should show a dashcard title", () => {
    setup();
    expect(screen.getByText("My Card")).toBeVisible();
  });

  it("should show card's description in a tooltip", async () => {
    setup();
    expect(screen.queryByText("This is a table card")).not.toBeInTheDocument();
    userEvent.hover(getIcon("info"));
    expect(await screen.findByText("This is a table card")).toBeVisible();
  });

  it("should not show the info icon if a card doesn't have description", () => {
    setup({
      dashcard: createMockDashboardCard({
        card: createMockCard({ description: null }),
      }),
    });
    expect(queryIcon("info")).not.toBeInTheDocument();
  });

  it("should show a table card", () => {
    setup();
    act(() => {
      jest.runAllTimers();
    });

    // Scoping to visualization root because there can be other elements with the same text used for column widths measurements
    const visualizationRoot = screen.getByTestId("visualization-root");
    expect(within(visualizationRoot).getByText("My Card")).toBeVisible();
    expect(within(visualizationRoot).getByRole("grid")).toBeVisible();
    expect(within(visualizationRoot).getByText("NAME")).toBeVisible();
    expect(within(visualizationRoot).getByText("Davy Crocket")).toBeVisible();
    expect(within(visualizationRoot).getByText("Daniel Boone")).toBeVisible();
  });

  it("should show a text card", () => {
    const textCard = createMockTextDashboardCard({ text: "Hello, world!" });
    setup({
      dashboard: {
        ...testDashboard,
        dashcards: [textCard],
      },
      dashcard: textCard,
      dashcardData: {},
    });
    expect(screen.getByText("Hello, world!")).toBeVisible();
  });

  it("should show a heading card", () => {
    const textCard = createMockHeadingDashboardCard({
      text: "What a cool section",
    });
    setup({
      dashboard: {
        ...testDashboard,
        dashcards: [textCard],
      },
      dashcard: textCard,
      dashcardData: {},
    });
    expect(screen.getByText("What a cool section")).toBeVisible();
  });

  it("should not display the ellipsis menu for (unsaved) xray dashboards (metabase#33637)", () => {
    setup({ isXray: true });
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not display the 'Download results' action when dashcard query is running", () => {
    setup({ dashcardData: {} });
    // in this case the dashcard menu would be empty so it's not rendered at all
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not display the 'Download results' action when dashcard query is running in public/embedded dashboards", () => {
    setup({ isPublicOrEmbedded: true, dashcardData: {} });
    // in this case the dashcard menu would be empty so it's not rendered at all
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should show a link card", () => {
    const linkCard = createMockLinkDashboardCard({
      url: "https://xkcd.com/327",
    });
    setup({
      dashboard: {
        ...testDashboard,
        dashcards: [linkCard],
      },
      dashcard: linkCard,
      dashcardData: {},
    });
    expect(screen.getByText("https://xkcd.com/327")).toBeVisible();
  });

  it("should not show a 'replace card' action", () => {
    setup({ isEditing: false });
    expect(screen.queryByLabelText("Replace")).not.toBeInTheDocument();
  });

  describe("edit mode", () => {
    it("should not show the info icon", () => {
      setup({ isEditing: true });
      expect(queryIcon("info")).not.toBeInTheDocument();
    });

    it("should show a 'replace card' action", async () => {
      setup({ isEditing: true });
      expect(screen.getByLabelText("Replace")).toBeInTheDocument();
    });

    it("should show a 'replace card' action for erroring queries", async () => {
      setup({ isEditing: true, dashcardData: erroringDashcardData });
      expect(screen.getByLabelText("Replace")).toBeInTheDocument();
    });

    it.each([
      ["heading", createMockHeadingDashboardCard()],
      ["text", createMockTextDashboardCard()],
      ["link", createMockLinkDashboardCard()],
    ])("should not show a 'replace card' action for %s cards", (_, card) => {
      setup({
        dashboard: {
          ...testDashboard,
          dashcards: [card],
        },
        dashcard: card,
        dashcardData: {},
        isEditing: true,
      });
      expect(screen.queryByLabelText("Replace")).not.toBeInTheDocument();
    });
  });
});
