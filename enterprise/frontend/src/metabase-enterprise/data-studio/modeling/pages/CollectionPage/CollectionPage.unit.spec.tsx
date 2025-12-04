import fetchMock from "fetch-mock";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionPage } from "./CollectionPage";

const TEST_COLLECTION = createMockCollection({
  id: 1,
  name: "Test Collection",
});

const TEST_MODEL_ITEM = createMockCollectionItem({
  id: 1,
  name: "Test Model",
  model: "dataset",
  collection_id: TEST_COLLECTION.id,
});

const TEST_METRIC_ITEM = createMockCollectionItem({
  id: 2,
  name: "Test Metric",
  model: "metric",
  collection_id: TEST_COLLECTION.id,
});

const TEST_CARD_ITEM = createMockCollectionItem({
  id: 3,
  name: "Test Question",
  model: "card",
  collection_id: TEST_COLLECTION.id,
});

interface SetupOpts {
  collection?: typeof TEST_COLLECTION;
  collectionItems?: (typeof TEST_MODEL_ITEM)[];
  collectionError?: string;
  itemsError?: string;
}

const setup = async ({
  collection = TEST_COLLECTION,
  collectionItems = [],
  collectionError,
  itemsError,
}: SetupOpts = {}) => {
  setupCollectionByIdEndpoint({
    collections: [collection],
    error: collectionError,
  });

  if (itemsError) {
    fetchMock.get(`path:/api/collection/${collection.id}/items`, {
      status: 500,
      body: itemsError,
    });
  } else {
    setupCollectionItemsEndpoint({
      collection,
      collectionItems,
      models: ["dataset", "metric"],
    });
  }

  renderWithProviders(
    <CollectionPage params={{ collectionId: String(collection.id) }} />,
  );
};

describe("CollectionPage", () => {
  it("should show loading state initially", async () => {
    await setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render collection name in header", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_COLLECTION.name)).toBeInTheDocument();
  });

  it("should display empty state when collection has no items", async () => {
    await setup({
      collectionItems: [],
    });

    await waitForLoaderToBeRemoved();
    expect(
      await screen.findByText("No models or metrics yet"),
    ).toBeInTheDocument();
  });

  it("should display items table when collection has models", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("collection-page")).toBeInTheDocument();
    expect(screen.getByText(TEST_MODEL_ITEM.name)).toBeInTheDocument();
  });

  it("should display items table when collection has metrics", async () => {
    await setup({
      collectionItems: [TEST_METRIC_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("collection-page")).toBeInTheDocument();
    expect(screen.getByText(TEST_METRIC_ITEM.name)).toBeInTheDocument();
  });

  it("should display both models and metrics in items table", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM, TEST_METRIC_ITEM, TEST_CARD_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText(TEST_MODEL_ITEM.name)).toBeInTheDocument();
    expect(screen.getByText(TEST_METRIC_ITEM.name)).toBeInTheDocument();
    // should filter out cards
    expect(screen.queryByText(TEST_CARD_ITEM.name)).not.toBeInTheDocument();
  });

  it("should show model icons", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(await screen.findByLabelText("model icon")).toBeInTheDocument();
  });

  it("should show metric icons", async () => {
    await setup({
      collectionItems: [TEST_METRIC_ITEM],
    });

    await waitForLoaderToBeRemoved();

    expect(await screen.findByLabelText("metric icon")).toBeInTheDocument();
  });

  it("should display error when collection fails to load", async () => {
    const errorMessage = "Failed to load collection";
    await setup({
      collectionError: errorMessage,
    });
    await waitForLoaderToBeRemoved();
    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
  });

  it("should display error when items fail to load", async () => {
    const errorMessage = "Failed to load items";
    await setup({
      itemsError: errorMessage,
    });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it("should request only models and metrics from API", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM, TEST_METRIC_ITEM],
    });

    await waitForLoaderToBeRemoved();

    const calls = await findRequests("GET");
    expect(calls).toHaveLength(2);
    const [collectionCall, itemsCall] = calls;
    expect(collectionCall.url).toContain(`/collection/${TEST_COLLECTION.id}`);
    expect(itemsCall.url).toContain("/items");

    const url = new URL(itemsCall.url);
    const models = url.searchParams.getAll("models");
    expect(models).toEqual(["dataset", "metric"]);
  });

  it("should show collection name in page header", async () => {
    await setup({
      collectionItems: [TEST_MODEL_ITEM],
    });

    await waitForLoaderToBeRemoved();

    const page = screen.getByTestId("collection-page");
    expect(page).toBeInTheDocument();

    expect(screen.getByText(TEST_COLLECTION.name)).toBeInTheDocument();
  });
});
