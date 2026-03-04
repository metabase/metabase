import userEvent from "@testing-library/user-event";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  getIcon,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import {
  MockDashboardContext,
  type MockDashboardContextProps,
} from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import registerVisualizations from "metabase/visualizations/register";
import type { DashCardDataMap } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockHeadingDashboardCard,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockPlaceholderDashboardCard,
  createMockTable,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import type { DashCardProps } from "./DashCard";
import { DashCard } from "./DashCard";

registerVisualizations();

const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 2;

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
  isEditing,
  withMetadata = false,
  dashcardMenu,
  ...props
}: Partial<DashCardProps> &
  Pick<MockDashboardContextProps, "dashcardMenu" | "isEditing"> & {
    dashboard?: NonNullable<MockDashboardContextProps["dashboard"]>;
    dashcardData?: DashCardDataMap;
    withMetadata?: boolean;
  } = {}) {
  const onReplaceCard = jest.fn();

  const baseDashboardState = createMockDashboardState({
    dashcardData,
    dashcards: {
      [dashcard.id]: dashcard,
    },
  });

  const storeInitialState = createMockState({
    dashboard: baseDashboardState,
    ...(withMetadata && {
      entities: createMockEntitiesState({
        databases: [
          createMockDatabase({
            id: TEST_DATABASE_ID,
            tables: [
              createMockTable({ id: TEST_TABLE_ID, db_id: TEST_DATABASE_ID }),
            ],
          }),
        ],
      }),
    }),
  });

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      dashboard={dashboard}
      navigateToNewCardFromDashboard={jest.fn()}
      onChangeLocation={jest.fn()}
      downloadsEnabled={{ results: true }}
      slowCards={{}}
      isEditing={isEditing}
      isEditingParameter={false}
      dashcardMenu={dashcardMenu}
      reportAutoScrolledToDashcard={jest.fn()}
    >
      <DashCard
        dashcard={dashcard}
        gridItemWidth={4}
        totalNumGridCols={24}
        {...props}
        onReplaceCard={onReplaceCard}
        isTrashedOnRemove={false}
        onRemove={jest.fn()}
        markNewCardSeen={jest.fn()}
        onReplaceAllDashCardVisualizationSettings={jest.fn()}
        onUpdateVisualizationSettings={jest.fn()}
        showClickBehaviorSidebar={jest.fn()}
        autoScroll={false}
        onEditVisualization={jest.fn()}
      />
    </MockDashboardContext>,
    {
      storeInitialState,
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
    const hoverPromise = userEvent.hover(getIcon("info"));
    expect(await screen.findByText("This is a table card")).toBeVisible();
    await hoverPromise;
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

  it("should not display the ellipsis menu for dashboards whose dashcardMenu is null (i.e. for X-rays - metabase#33637)", () => {
    setup({ dashcardMenu: null });
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not display the 'Download results' action when dashcard query is running", () => {
    setup({ dashcardData: {} });
    // in this case the dashcard menu would be empty so it's not rendered at all
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not display the 'Download results' action when dashcard menu options are empty (like when dashcard query is running in public/embedded dashboards)", () => {
    setup({
      dashcardMenu: {
        withDownloads: false,
        withEditLink: false,
        customItems: [],
      },
      dashcardData: {},
    });
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

    it("should not show the chevron icon (VIZ-1111)", () => {
      setup({
        isEditing: true,
        dashcard: createMockDashboardCard({
          series: [
            createMockCard({
              id: 115,
              display: "line",
              visualization_settings: {
                "graph.x_axis.scale": "timeseries",
                "graph.dimensions": ["CREATED_AT"],
                "graph.metrics": ["avg"],
              },
            }),
          ],
          card: createMockCard({
            name: "Hello I'm a card",
            type: "question",
            id: 49,
          }),
          visualization_settings: {
            visualization: {
              display: "line",
              columnValuesMapping: {
                COLUMN_1: [
                  {
                    sourceId: "card:49",
                    originalName: "DATE_RECEIVED",
                    name: "COLUMN_1",
                  },
                ],
                COLUMN_2: [
                  {
                    sourceId: "card:49",
                    originalName: "avg",
                    name: "COLUMN_2",
                  },
                ],
                COLUMN_3: [
                  {
                    sourceId: "card:115",
                    originalName: "avg",
                    name: "COLUMN_3",
                  },
                ],
                COLUMN_4: [
                  {
                    sourceId: "card:115",
                    originalName: "CREATED_AT",
                    name: "COLUMN_4",
                  },
                ],
              },
              settings: {
                "graph.x_axis.scale": "timeseries",
                "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
                "graph.metrics": ["COLUMN_2", "COLUMN_3"],
                "card.title": "Oh my, another card",
              },
            },
          },
          dashboard_id: 21,
        }),
      });

      expect(queryIcon("chevrondown")).not.toBeInTheDocument();
    });

    it("should show a 'replace card' action for erroring queries", async () => {
      setup({ isEditing: true, dashcardData: erroringDashcardData });
      expect(screen.getByLabelText("Replace")).toBeInTheDocument();
    });

    it("should show correct editing actions for viz types supported by visualizer", () => {
      const dashcard = createMockDashboardCard({
        card: createMockCard({
          name: "My Card",
          description: "This is a table card",
          display: "bar",
        }),
      });

      setup({
        dashboard: {
          ...testDashboard,
          dashcards: [dashcard],
        },
        dashcard,
        isEditing: true,
      });

      expect(
        screen.getByLabelText("Visualize another way"),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Show visualization options"),
      ).not.toBeInTheDocument();
    });

    it("should show correct editing actions for viz types not supported by visualizer", () => {
      const dashcard = createMockDashboardCard({
        card: createMockCard({
          name: "My Card",
          description: "This is a table card",
          display: "smartscalar",
        }),
      });

      setup({
        dashboard: {
          ...testDashboard,
          dashcards: [dashcard],
        },
        dashcard,
        isEditing: true,
      });

      expect(
        screen.getByLabelText("Visualize another way"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Show visualization options"),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Edit visualization"),
      ).not.toBeInTheDocument();
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

    describe("'add filter' action", () => {
      it("should be visible for heading cards", () => {
        const headingCard = createMockHeadingDashboardCard();
        setup({
          dashboard: {
            ...testDashboard,
            dashcards: [headingCard],
          },
          dashcard: headingCard,
          dashcardData: {},
          isEditing: true,
        });
        expect(screen.getByLabelText("Add a filter")).toBeInTheDocument();
      });

      it("should be visible for question cards", () => {
        const dashcard = createMockDashboardCard({
          card: createMockCard({
            dataset_query: {
              type: "query",
              database: TEST_DATABASE_ID,
              query: {
                "source-table": TEST_TABLE_ID,
              },
            },
          }),
        });
        setup({
          dashboard: {
            ...testDashboard,
            dashcards: [dashcard],
          },
          dashcard,
          dashcardData: {},
          isEditing: true,
          withMetadata: true,
        });
        expect(screen.getByLabelText("Add a filter")).toBeInTheDocument();
      });

      it("should not be visible for question cards when user cannot edit the question", () => {
        const dashcard = createMockDashboardCard({
          card: createMockCard({
            can_write: false,
            dataset_query: {
              type: "query",
              database: TEST_DATABASE_ID,
              query: {
                "source-table": TEST_TABLE_ID,
              },
            },
          }),
        });
        setup({
          dashboard: {
            ...testDashboard,
            dashcards: [dashcard],
          },
          dashcard,
          dashcardData: {},
          isEditing: true,
          withMetadata: true,
        });
        expect(screen.queryByLabelText("Add a filter")).not.toBeInTheDocument();
      });

      it.each([
        ["action", createMockActionDashboardCard()],
        ["text", createMockTextDashboardCard()],
        ["link", createMockLinkDashboardCard()],
        ["iframe", createMockIFrameDashboardCard()],
        ["placeholder", createMockPlaceholderDashboardCard()],
      ])("should not be visible for %s cards", (_, dashcard) => {
        setup({
          dashboard: {
            ...testDashboard,
            dashcards: [dashcard],
          },
          dashcard,
          dashcardData: {},
          isEditing: true,
        });
        expect(screen.queryByLabelText("Add a filter")).not.toBeInTheDocument();
      });
    });
  });
});
