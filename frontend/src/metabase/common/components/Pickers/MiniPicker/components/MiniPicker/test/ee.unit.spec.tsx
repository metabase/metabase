import fetchMock from "fetch-mock";

import { setupCollectionItemsEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

const LIBRARY_COLLECTION = createMockCollection({
  name: "library",
  type: "library",
  id: 1337,
  below: ["dataset", "metric"],
});

const LIBRARY_DATA_COLLECTION = createMockCollectionItem({
  name: "data",
  type: "library-data",
  model: "collection",
  id: 1338,
  here: ["dataset"],
});

const LIBRARY_METRICS_COLLECTION = createMockCollectionItem({
  name: "metrics",
  type: "library-metrics",
  model: "collection",
  id: 1339,
  here: ["metric"],
});

describe("library", () => {
  it("should default to the library if it's available", async () => {
    fetchMock.get("path:/api/ee/library", LIBRARY_COLLECTION);
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [LIBRARY_DATA_COLLECTION, LIBRARY_METRICS_COLLECTION],
    });

    setup(
      {},
      { tokenFeatures: createMockTokenFeatures({ data_studio: true }) },
    );

    expect(await screen.findByText("metrics")).toBeInTheDocument();
    expect(await screen.findByText("data")).toBeInTheDocument();
  });

  it("should hide an empty library collection", async () => {
    fetchMock.get("path:/api/ee/library", {
      ...LIBRARY_COLLECTION,
      below: [],
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [
        { ...LIBRARY_DATA_COLLECTION, here: undefined },
        { ...LIBRARY_METRICS_COLLECTION, here: undefined },
      ],
    });

    setup(
      { models: ["dataset", "metric"] },
      { tokenFeatures: createMockTokenFeatures({ data_studio: true }) },
    );

    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
  });

  it("should drill into child folders when you only have metrics or models", async () => {
    fetchMock.get("/api/ee/library", {
      ...LIBRARY_COLLECTION,
      below: ["dataset"],
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [
        LIBRARY_DATA_COLLECTION,
        { ...LIBRARY_METRICS_COLLECTION, here: undefined },
      ],
    });

    setupCollectionItemsEndpoint({
      collection: LIBRARY_DATA_COLLECTION,
      collectionItems: [
        createMockCollectionItem({ model: "dataset", name: "Surprise" }),
      ],
    });

    setup(
      { models: ["dataset", "metric"] },
      { tokenFeatures: createMockTokenFeatures({ data_studio: true }) },
    );
    expect(await screen.findByText("Surprise")).toBeInTheDocument();
    expect(screen.queryByText("metrics")).not.toBeInTheDocument();
  });

  it("should hide respect the shouldShowLibrary prop", async () => {
    fetchMock.get("path:/api/ee/library", LIBRARY_COLLECTION);
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [LIBRARY_DATA_COLLECTION, LIBRARY_METRICS_COLLECTION],
    });

    setup(
      { shouldShowLibrary: false },
      { tokenFeatures: createMockTokenFeatures({ data_studio: true }) },
    );

    expect(await screen.findByText("Mini Db")).toBeInTheDocument();
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("data")).not.toBeInTheDocument();
    expect(screen.queryByText("metrics")).not.toBeInTheDocument();
  });
});
