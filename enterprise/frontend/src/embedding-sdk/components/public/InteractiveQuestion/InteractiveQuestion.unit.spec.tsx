import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCurrentUserEndpoint, setupDatabaseEndpoints,
  setupPropertiesEndpoints, setupSchemaEndpoints,
  setupSettingsEndpoints,
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
  createMockCard, createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { InteractiveQuestion } from "./InteractiveQuestion";

const TEST_USER = createMockUser();
const TEST_CARD_ID = 1;
const TEST_CARD = createMockCard({ id: TEST_CARD_ID });
const TEST_DB_ID = 1;
const TEST_DB = createMockDatabase({ id: TEST_DB_ID })

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

  setupEnterprisePlugins();

  setupCurrentUserEndpoint(TEST_USER);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  setupCardEndpoints(TEST_CARD);
  setupAlertsEndpoints(TEST_CARD, [])
  setupDatabaseEndpoints(TEST_DB)

  renderWithProviders(<InteractiveQuestion questionId={questionId} />, {
    mode: "sdk",
    sdkConfig: createMockConfig(),
    storeInitialState: state,
  });
};

describe("InteractiveQuestion", () => {
  it("should render", async () => {
    setup({ questionId: 1 });

    await waitForLoaderToBeRemoved();

    screen.debug(undefined, 10000000);
  });
});
