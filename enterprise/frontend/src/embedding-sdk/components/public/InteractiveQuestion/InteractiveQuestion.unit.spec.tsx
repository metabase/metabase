import { within } from "@testing-library/react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCurrentUserEndpoint,
  setupDatabaseEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupTableEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { InteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import {
  createMockCard,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockSettings,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { InteractiveQuestion } from "./InteractiveQuestion";

const TEST_USER = createMockUser();
const TEST_DB_ID = 1;
const TEST_DB = createMockDatabase({ id: TEST_DB_ID });

const TEST_TABLE_ID = 1;
const TEST_TABLE = createMockTable({ id: TEST_TABLE_ID, db_id: TEST_DB_ID });

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

const setup = ({ questionId }: InteractiveQuestionProps) => {
  const settingValues = createMockSettings();
  const tokenFeatures = createMockTokenFeatures();

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser: TEST_USER,
  });

  const TEST_CARD = createMockCard({ id: questionId });

  setupEnterprisePlugins();

  setupCurrentUserEndpoint(TEST_USER);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  if (questionId === 1) {
    setupCardEndpoints(TEST_CARD);
  } else {
    setupUnauthorizedCardEndpoints(TEST_CARD);
  }
  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DB);

  setupTableEndpoints(TEST_TABLE);

  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  renderWithProviders(<InteractiveQuestion questionId={questionId} />, {
    mode: "sdk",
    sdkConfig: createMockConfig(),
    storeInitialState: state,
  });
};

describe("InteractiveQuestion", () => {
  it("should initially render with a loader", async () => {
    setup({ questionId: 1 });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should render when question is valid", async () => {
    setup({ questionId: 1 });

    await waitForLoaderToBeRemoved();

    expect(screen.getByLabelText("Test Column")).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  it("should not render if a question is invalid", async () => {
    setup({ questionId: 1395813 });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Invalid question")).toBeInTheDocument();
  });
});
