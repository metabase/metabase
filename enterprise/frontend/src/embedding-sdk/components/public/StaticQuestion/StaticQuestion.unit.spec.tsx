import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { QueryVisualizationProps } from "./";
import { StaticQuestion } from "./";

const TEST_QUESTION_ID = 1;
const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});
const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [TEST_COLUMN],
    rows: [["Test Row"]],
  }),
});

const VISUALIZATION_TYPES: Record<
  string,
  {
    container: string;
    button: string;
  }
> = {
  Table: { container: "Table-container", button: "Table-button" },
  Number: {
    container: "Number-container",
    button: "Number-button",
  },
  Gauge: {
    container: "Gauge-container",
    button: "Gauge-button",
  },
  Detail: {
    container: "Detail-container",
    button: "Detail-button",
  },
  Progress: {
    container: "Progress-container",
    button: "Progress-button",
  },
};

const setup = ({
  showVisualizationSelector = false,
  isValidCard = true,
}: Partial<QueryVisualizationProps> & {
  isValidCard?: boolean;
} = {}) => {
  const TEST_CARD = createMockCard();
  if (isValidCard) {
    setupCardEndpoints(TEST_CARD);
  } else {
    setupUnauthorizedCardEndpoints(TEST_CARD);
  }
  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  renderWithProviders(
    <StaticQuestion
      questionId={TEST_QUESTION_ID}
      showVisualizationSelector={showVisualizationSelector}
    />,
    {
      mode: "sdk",
      sdkConfig: createMockConfig({
        jwtProviderUri: "http://TEST_URI/sso/metabase",
      }),
    },
  );
};

describe("StaticQuestion", () => {
  it("should render a loader on initialization", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should render question if question is valid", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(
      within(screen.getByTestId("header-cell")).getByText(TEST_COLUMN.name),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  it("should render an error if a question isn't found", async () => {
    setup({ isValidCard: false });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(
      screen.getByText("You don't have permissions to do that."),
    ).toBeInTheDocument();
  });

  it("should render a visualization selector if showVisualizationSelector is true", async () => {
    setup({ showVisualizationSelector: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByTestId("chart-type-sidebar")).toBeInTheDocument();
  });

  it("should not render a visualization selector if showVisualizationSelector is false", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.queryByTestId("chart-type-sidebar")).not.toBeInTheDocument();
  });

  it("should change the visualization if a different visualization is selected", async () => {
    setup({ showVisualizationSelector: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByTestId("chart-type-sidebar")).toBeInTheDocument();

    for (const visType of Object.keys(VISUALIZATION_TYPES)) {
      await userEvent.click(
        screen.getByTestId(VISUALIZATION_TYPES[visType].button),
      );

      expect(
        screen.getByTestId(VISUALIZATION_TYPES[visType].container),
      ).toHaveAttribute("aria-selected", "true");
    }
  });
});
