import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { SdkQuestion } from "./SdkQuestion";

const TEST_USER = createMockUser();
const TEST_DB_ID = 1;

const TEST_TABLE_ID = 1;
const TEST_TABLE = createMockTable({ id: TEST_TABLE_ID, db_id: TEST_DB_ID });

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

const setup = ({ autoRunQueries }: { autoRunQueries: boolean }) => {
  const onRun = jest.fn();
  const testDb = createMockDatabase({
    id: TEST_DB_ID,
    auto_run_queries: autoRunQueries,
  });
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  const card = createMockCard({ enable_embedding: true });

  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({
      databases: [testDb],
      tables: [TEST_TABLE],
    }),
  );
  setupAlertsEndpoints(card, []);
  setupDatabaseEndpoints(testDb);
  setupTableEndpoints(TEST_TABLE);
  setupCardQueryEndpoints(card, TEST_DATASET);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: 1, can_write: true })],
  });

  const queryPath = `path:/api/card/${card.id}/query`;

  renderWithSDKProviders(
    <SdkQuestion questionId={card.id} onRun={onRun}>
      <SdkQuestion.Title />
      <SdkQuestion.RefreshButton />
    </SdkQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  const lastQueryBody = async () => {
    const [lastCall] = fetchMock.callHistory.calls(queryPath).slice(-1);
    return lastCall?.request?.clone().json();
  };

  return {
    onRun,
    lastQueryBody,
    queryCalls: () => fetchMock.callHistory.calls(queryPath).length,
  };
};

describe("SdkQuestion.RefreshButton", () => {
  it("should not render when automatic reruns are on", async () => {
    setup({ autoRunQueries: true });

    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(screen.queryByTestId("refresh-button")).not.toBeInTheDocument();
  });

  it("should rerun the query when automatic reruns are off", async () => {
    const { queryCalls, onRun, lastQueryBody } = setup({
      autoRunQueries: false,
    });

    const button = await screen.findByTestId("refresh-button");
    await waitFor(() => expect(queryCalls()).toBe(1));

    expect(onRun).not.toHaveBeenCalled();

    await userEvent.click(button);

    await waitFor(() => expect(queryCalls()).toBe(2));
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
    expect(await lastQueryBody()).toMatchObject({ ignore_cache: true });
  });
});
