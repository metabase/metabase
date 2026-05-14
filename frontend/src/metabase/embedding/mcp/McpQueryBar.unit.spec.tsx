import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
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

import { McpQueryBar } from "./McpQueryBar";

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
      filter: [
        "between",
        ["field", ORDERS.CREATED_AT, null],
        "2024-01-01",
        "2024-12-31",
      ],
    },
  },
});

const ONE_POINT_RESULT = createMockDataset({
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

  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DATABASE] }),
  );
  setupDatabaseEndpoints(TEST_DATABASE);

  setupAlertsEndpoints(TEST_CARD, []);
  setupCardQueryEndpoints(TEST_CARD, ONE_POINT_RESULT);

  renderWithSDKProviders(
    <SdkQuestion
      questionId={TEST_CARD.id}
      isSaveEnabled={false}
      withEditorButton={false}
      withChartTypeSelector={false}
    >
      <McpQueryBar app={app as any} instanceUrl="https://metabase.example" />
    </SdkQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  return { app };
}

describe("McpQueryBar", () => {
  it("renders remaining query controls when a one-point result has no MCP chart types", async () => {
    setup();

    expect(await screen.findByTestId("query-explorer-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /explore/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "line" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "bar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "area" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "table" }),
    ).not.toBeInTheDocument();
  });
});
