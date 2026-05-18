import userEvent from "@testing-library/user-event";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import * as Urls from "metabase/urls";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { McpExploreButton } from "./McpExploreButton";

const TEST_USER = createMockUser();
const TEST_DATABASE = createSampleDatabase();
const TEST_CARD = createMockCard({
  display: "line",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "quarter" }]],
    },
  },
});

const QUERY_RESULT = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockNumericColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
      }),
    ],
    rows: [[26000]],
  }),
});

function setup() {
  const { state } = setupSdkState({ currentUser: TEST_USER });
  const app = { openLink: jest.fn() };
  const instanceUrl = "https://metabase.example";

  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DATABASE] }),
  );
  setupDatabaseEndpoints(TEST_DATABASE);

  setupAlertsEndpoints(TEST_CARD, []);
  setupCardQueryEndpoints(TEST_CARD, QUERY_RESULT);

  renderWithSDKProviders(
    <SdkQuestion
      questionId={TEST_CARD.id}
      isSaveEnabled={false}
      withEditorButton={false}
      withChartTypeSelector={false}
    >
      <McpExploreButton app={app as any} instanceUrl={instanceUrl} />
    </SdkQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  return { app, instanceUrl };
}

describe("McpExploreButton", () => {
  it("opens the current question in Metabase", async () => {
    const user = userEvent.setup();
    const { app, instanceUrl } = setup();

    await user.click(
      await screen.findByRole("button", { name: /explore in metabase/i }),
    );

    await waitFor(() => {
      expect(app.openLink).toHaveBeenCalledWith({
        url:
          instanceUrl +
          Urls.serializedQuestion({
            ...TEST_CARD,
            original_card_id: TEST_CARD.id,
          }),
      });
    });
  });
});
