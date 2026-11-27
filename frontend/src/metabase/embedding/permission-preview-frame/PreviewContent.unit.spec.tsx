import userEvent from "@testing-library/user-event";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCardDataset,
} from "__support__/server-mocks/dataset";
import {
  mockGetBoundingClientRect,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { useLocale } from "metabase/common/hooks/use-locale";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
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

import { PreviewContent } from "./PreviewContent";

const TEST_DATABASE = createMockDatabase({ id: 1 });
const TEST_TABLE = createMockTable({ id: 1, db_id: 1 });
const TEST_CARD = createMockCard({
  id: 7,
  name: "Orders by state",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});
const TEST_COLUMN = createMockColumn({
  display_name: "State",
  name: "State",
});
const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({ cols: [TEST_COLUMN], rows: [["TX"]] }),
});

interface SetupOpts {
  initialItem: string;
}

async function setup({ initialItem }: SetupOpts) {
  const onNavigate = jest.fn();
  const { state } = setupSdkState({ currentUser: createMockUser() });

  setupCardEndpoints(TEST_CARD);
  setupCardQueryMetadataEndpoint(
    TEST_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DATABASE] }),
  );
  setupAlertsEndpoints(TEST_CARD, []);
  setupDatabaseEndpoints(TEST_DATABASE);
  setupTableEndpoints(TEST_TABLE);
  setupCardQueryEndpoints(TEST_CARD, TEST_DATASET);
  setupCardDataset({ dataset: TEST_DATASET });
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({
      databases: [TEST_DATABASE],
      tables: [TEST_TABLE],
    }),
  );
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: 1 })],
  });

  renderWithSDKProviders(
    <>
      <LocaleProbe />
      <PreviewContent initialItem={initialItem} onNavigate={onNavigate} />
    </>,
    {
      componentProviderProps: { authConfig: createMockSdkConfig() },
      storeInitialState: state,
    },
  );

  await screen.findByText("locale ready");

  return { onNavigate };
}

function LocaleProbe() {
  const { isLocaleLoading } = useLocale();
  return <div>{isLocaleLoading ? "locale loading" : "locale ready"}</div>;
}

describe("PreviewContent", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("renders a question with the Embedding SDK: downloads on, saving off", async () => {
    await setup({ initialItem: "question/7" });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Orders by state")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("table-root")).getByText("State"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("download icon")).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("offers Back over an item that is open from the start, and goes to All collections", async () => {
    const { onNavigate } = await setup({ initialItem: "question/7" });
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: /Back to collections$/ }),
    );

    expect(onNavigate).toHaveBeenCalledWith("collection/all");
  });

  it("shows the not found page for a link that names no item", async () => {
    await setup({ initialItem: "not-found" });

    expect(await screen.findByText("We're a little lost...")).toBeVisible();
    expect(
      screen.getByText("The page you asked for couldn't be found."),
    ).toBeVisible();
  });
});
