import { queryIcon, renderWithProviders, screen } from "__support__/ui";

import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockSettings,
  createMockDatasetData,
  createMockTextDashboardCard,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";

import { createMockState } from "metabase-types/store/mocks";
import type { DashCardProps } from "./DashCard";
import { DashCard } from "./DashCard";

registerVisualizations();

const dashboard = createMockDashboard();

const tableDashcard = createMockDashboardCard({
  card: createMockCard({
    name: "My Card",
    display: "table",
  }),
});

const metadata = createMockMetadata({}, createMockSettings());

const store = createMockState({});

function setup(
  options?: Partial<DashCardProps>,
  storeOptions?: Partial<typeof store>,
) {
  return renderWithProviders(
    <DashCard
      dashboard={dashboard}
      dashcard={tableDashcard}
      gridItemWidth={4}
      totalNumGridCols={24}
      dashcardData={{
        1: {
          1: {
            data: createMockDatasetData({
              rows: [["Davy Crocket"], ["Daniel Boone"]],
            }),
            database_id: 1,
            context: "dashboard",
            running_time: 50,
            row_count: 2,
            status: "completed",
          },
        },
      }}
      slowCards={{}}
      parameterValues={{}}
      metadata={metadata}
      isEditing={false}
      isEditingParameter={false}
      onAddSeries={jest.fn()}
      onRemove={jest.fn()}
      markNewCardSeen={jest.fn()}
      navigateToNewCardFromDashboard={jest.fn()}
      onReplaceAllVisualizationSettings={jest.fn()}
      onUpdateVisualizationSettings={jest.fn()}
      showClickBehaviorSidebar={jest.fn()}
      onChangeLocation={jest.fn()}
      {...options}
    />,
    { storeInitialState: { ...store, ...storeOptions } },
  );
}

describe("DashCard", () => {
  it("shows a dashcard title", () => {
    setup();
    expect(screen.getByText("My Card")).toBeVisible();
  });

  it("should not display the ellipsis menu for (unsaved) xray dashboards (metabase#33637)", async () => {
    setup({ isXray: true });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("shows a table visualization", () => {
    setup();
    expect(screen.getByText("My Card")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();

    expect(screen.getByText("NAME")).toBeVisible();
    expect(screen.getByText("Davy Crocket")).toBeVisible();
    expect(screen.getByText("Daniel Boone")).toBeVisible();
  });

  it("shows a text visualization", () => {
    const textCard = createMockTextDashboardCard({ text: "Hello, world!" });
    const board = {
      ...dashboard,
      dashcards: [textCard],
    };
    setup({
      dashboard: board,
      dashcard: textCard,
      dashcardData: {},
    });
    expect(screen.getByText("Hello, world!")).toBeVisible();
  });

  it("shows a heading visualization", () => {
    const textCard = createMockHeadingDashboardCard({
      text: "What a cool section",
    });
    const board = {
      ...dashboard,
      dashcards: [textCard],
    };
    setup({
      dashboard: board,
      dashcard: textCard,
      dashcardData: {},
    });
    expect(screen.getByText("What a cool section")).toBeVisible();
  });

  it("shows a link visualization", () => {
    const linkCard = createMockLinkDashboardCard({
      url: "https://xkcd.com/327",
    });
    const board = {
      ...dashboard,
      dashcards: [linkCard],
    };
    setup({
      dashboard: board,
      dashcard: linkCard,
      dashcardData: {},
    });
    expect(screen.getByText("https://xkcd.com/327")).toBeVisible();
  });

  it("in parameter editing mode, shows faded link dashcard", () => {
    const linkCard = createMockLinkDashboardCard({
      url: "https://xkcd.com/327",
    });
    const board = {
      ...dashboard,
      dashcards: [linkCard],
    };
    setup({
      dashboard: board,
      dashcard: linkCard,
      dashcardData: {},
      isEditing: true,
      isEditingParameter: true,
    });

    expect(screen.getByText("https://xkcd.com/327")).toBeVisible();
    expect(screen.getByTestId("custom-view-text-link")).toHaveStyle({
      opacity: 0.25,
    });
  });
});
