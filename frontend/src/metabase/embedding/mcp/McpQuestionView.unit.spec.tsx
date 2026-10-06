import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCurrentUserEndpoint,
  setupDatabaseEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockEmbedState, createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { utf8_to_b64 } from "metabase/utils/encoding";
import MetabaseSettings from "metabase/utils/settings";
import type { User } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockMcpAppsBootstrapResponse,
  createMockMcpAppsBootstrapSettings,
  createMockNumericColumn,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { McpQuestionView } from "./McpQuestionView";
import type { DerivedQuery } from "./api";
import type { McpDeriveOperation } from "./derive";

const TEST_DATABASE = createSampleDatabase();

const TEST_CARD = createMockCard({
  name: "Orders over time",
  display: "table",
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
      createMockDatetimeColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        source: "breakout",
        unit: "quarter",
      }),
      createMockNumericColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
      }),
    ],
    rows: [["2024-01-01T00:00:00Z", 26000]],
  }),
});

/**
 * What `GET /api/embed-mcp/bootstrap` answers, not what a logged-in browser session
 * sees: a seven-field user projection and the visibility-filtered settings map. The
 * SDK token feature is switched on because the MCP iframe mounts SDK components and
 * `renderWithSDKProviders` only defaults it in when the caller seeds no settings.
 */
const BOOTSTRAP = createMockMcpAppsBootstrapResponse({
  settings: createMockMcpAppsBootstrapSettings({
    "enable-embedding-sdk": true,
    "token-features": createMockTokenFeatures({ embedding_sdk: true }),
  }),
});

function setup() {
  const { user, settings } = BOOTSTRAP;
  const isQueryRunningRef = { current: false };
  const deriveQuery = jest.fn<
    Promise<DerivedQuery>,
    [McpDeriveOperation[], (derived: DerivedQuery) => void]
  >(() => new Promise(() => {}));

  // Reproduces the widening `useMcpUserAndSettingsFetch` does when it seeds the cache: at
  // runtime the store holds a `User` carrying only these fields.
  const currentUser = user as User;

  setupCurrentUserEndpoint(currentUser);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DATABASE] }),
  );
  setupDatabaseEndpoints(TEST_DATABASE);
  setupAlertsEndpoints(TEST_CARD, []);
  setupCardQueryEndpoints(TEST_CARD, QUERY_RESULT);

  // Not `mockSettings`: it re-expands through `createMockSettings`, restoring the admin-only
  // settings the projection drops and hiding the regression this spec guards.
  MetabaseSettings.setAll(settings);

  const state = createMockState({
    currentUser,
    settings: { values: settings, loading: false },
    sdk: createMockSdkState({
      initStatus: createMockLoginStatusState({ status: "success" }),
    }),
    embed: createMockEmbedState(),
  });

  renderWithSDKProviders(
    <SdkQuestion
      questionId={TEST_CARD.id}
      isSaveEnabled={false}
      withEditorButton={false}
      withChartTypeSelector={false}
    >
      <McpQuestionView
        queryKey="test-query"
        safeAreaPaddingTop={0}
        deriveQuery={deriveQuery}
        applyOperationsRef={{ current: null }}
        isQueryRunningRef={isQueryRunningRef}
      />
    </SdkQuestion>,
    {
      componentProviderProps: { authConfig: createMockSdkConfig() },
      storeInitialState: state,
    },
  );

  return { deriveQuery };
}

describe("McpQuestionView with the MCP Apps bootstrap projection (GHY-4400)", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 800, height: 400 });
  });

  it("renders the visualization when the store holds only the bootstrap user and settings", async () => {
    setup();

    const visualization = await screen.findByTestId("query-visualization-root");

    expect(
      await within(visualization).findByText("26,000"),
    ).toBeInTheDocument();
    expect(within(visualization).getByText("Created At")).toBeInTheDocument();
  });

  it("renders the question title and the time controls, not an error state", async () => {
    setup();

    expect(await screen.findByText("Count by Created At")).toBeInTheDocument();
    expect(screen.getByTestId("query-explorer-bar")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/gone wrong/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks the server to derive a rebucketed query rather than building one", async () => {
    const { deriveQuery } = setup();

    await userEvent.click(await screen.findByText("by quarter"));
    await userEvent.click(await screen.findByRole("option", { name: "Month" }));

    expect(deriveQuery).toHaveBeenCalledWith(
      [{ type: "temporal-bucket/set", unit: "month" }],
      expect.any(Function),
    );
  });

  it("shows why a change failed, and clears it once a change succeeds", async () => {
    const { deriveQuery } = setup();
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.post("path:/api/dataset", QUERY_RESULT);
    fetchMock.post(
      "path:/api/dataset/query_metadata",
      createMockCardQueryMetadata({ databases: [TEST_DATABASE] }),
    );

    deriveQuery.mockRejectedValueOnce(
      Object.assign(new Error("deriveMcpQuery failed"), {
        status: 400,
        serverMessage: "This breakout cannot be bucketed by month.",
      }),
    );

    await userEvent.click(await screen.findByText("by quarter"));
    await userEvent.click(await screen.findByRole("option", { name: "Month" }));

    expect(
      await screen.findByText("This breakout cannot be bucketed by month."),
    ).toBeInTheDocument();

    deriveQuery.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await userEvent.click(await screen.findByText("by quarter"));
    await userEvent.click(await screen.findByRole("option", { name: "Year" }));

    expect(
      await screen.findByText("This change could not be applied."),
    ).toBeInTheDocument();

    deriveQuery.mockResolvedValueOnce({
      handle: "handle-2",
      query: utf8_to_b64(JSON.stringify(TEST_CARD.dataset_query)),
    });

    await userEvent.click(await screen.findByText("by quarter"));
    await userEvent.click(await screen.findByRole("option", { name: "Week" }));

    await waitFor(() => {
      expect(
        screen.queryByText("This change could not be applied."),
      ).not.toBeInTheDocument();
    });
  });
});
