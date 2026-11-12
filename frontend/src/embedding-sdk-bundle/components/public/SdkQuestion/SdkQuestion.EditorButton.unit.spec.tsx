import userEvent from "@testing-library/user-event";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { SdkQuestion } from "./SdkQuestion";

const TEST_USER = createMockUser();
const TEST_DB = createSampleDatabase();
const TEST_TABLE = checkNotNull(
  TEST_DB.tables?.find((table) => table.name === "ORDERS"),
);

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

const setup = ({
  isOpen = true,
}: {
  isOpen?: boolean;
} = {}) => {
  const { state } = setupSdkState({
    currentUser: TEST_USER,
  });

  const TEST_CARD = createMockCard({
    can_delete: true,
    enable_embedding: true,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  });

  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({
      databases: [TEST_DB],
      tables: [TEST_TABLE], // to be editable, card must have table and database metadata
    }),
  );

  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DB);

  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);

  const BOBBY_TEST_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: null,
    id: 1,
    location: "/",
    name: "Bobby Tables's Personal Collection",
    personal_owner_id: 100,
  });

  setupCollectionByIdEndpoint({
    collections: [BOBBY_TEST_COLLECTION],
  });

  const clickSpy = jest.fn();

  renderWithSDKProviders(
    <SdkQuestion questionId={TEST_CARD.id}>
      <div>Look! A Button! 👇</div>
      <SdkQuestion.EditorButton onClick={clickSpy} isOpen={isOpen} />
    </SdkQuestion>,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  return { clickSpy };
};

describe("InteractiveQuestion.EditorButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the editor button", async () => {
    setup({ isOpen: true });

    expect(await screen.findByTestId("notebook-button")).toBeInTheDocument();
  });

  it("should fire click handler when clicking the notebook button", async () => {
    const { clickSpy } = setup({ isOpen: true });

    await userEvent.click(await screen.findByTestId("notebook-button"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
