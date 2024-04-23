import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
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
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { QueryVisualizationProps } from "./";
import { StaticQuestion } from "./";

const TEST_QUESTION_ID = 1;
const TEST_USER = createMockUser();
const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        display_name: "Test Column",
        name: "Test Column",
      }),
    ],
    rows: [["Test Row"]],
  }),
});

const VISUALIZATION_TYPES = ["Table", "Number", "Gauge", "Detail", "Progress"];

const setup = ({
  showVisualizationSelector = false,
  isValidCard = true,
}: Partial<QueryVisualizationProps> & { isValidCard?: boolean } = {}) => {
  const settingValues = createMockSettings();
  const tokenFeatures = createMockTokenFeatures();

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };

  setupCurrentUserEndpoint(TEST_USER);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  const TEST_CARD = createMockCard();
  if (isValidCard) {
    setupCardEndpoints(TEST_CARD);
  } else {
    setupUnauthorizedCardEndpoints(TEST_CARD);
  }
  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser: TEST_USER,
  });

  renderWithProviders(
    <StaticQuestion
      questionId={TEST_QUESTION_ID}
      showVisualizationSelector={showVisualizationSelector}
    />,
    {
      mode: "sdk",
      sdkConfig: createMockConfig(),
      storeInitialState: state,
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

    expect(screen.getByLabelText("Test Column")).toBeInTheDocument();
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

    for (const visType of VISUALIZATION_TYPES) {
      await userEvent.click(screen.getByTestId(`${visType}-button`));

      expect(screen.getByTestId(`${visType}-container`)).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
  });
});
