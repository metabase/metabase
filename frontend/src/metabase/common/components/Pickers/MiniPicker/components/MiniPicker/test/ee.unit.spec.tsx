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

const LIBRARY_MODELS_COLELCTION = createMockCollectionItem({
  name: "data",
  type: "library-models",
  model: "collection",
  id: 1338,
  here: ["dataset"],
});

const LIBRARY_METRICS_COLELCTION = createMockCollectionItem({
  name: "metrics",
  type: "library-metrics",
  model: "collection",
  id: 1339,
  here: ["metric"],
});

describe("library", () => {
  it("should default to the library if it's available", async () => {
    fetchMock.get("/api/ee/library", LIBRARY_COLLECTION);
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [LIBRARY_MODELS_COLELCTION, LIBRARY_METRICS_COLELCTION],
    });

    setup({}, createMockTokenFeatures({ data_studio: true }));

    expect(await screen.findByText("metrics")).toBeInTheDocument();
    expect(await screen.findByText("data")).toBeInTheDocument();
  });

  it("should hide an empty library collection", async () => {
    fetchMock.get("/api/ee/library", {
      ...LIBRARY_COLLECTION,
      below: ["dataset"],
    });
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [
        LIBRARY_MODELS_COLELCTION,
        { ...LIBRARY_METRICS_COLELCTION, here: undefined },
      ],
    });

    setup({}, createMockTokenFeatures({ data_studio: true }));

    expect(await screen.findByText("data")).toBeInTheDocument();
    expect(screen.queryByText("metrics")).not.toBeInTheDocument();
  });

  it("should hide respect the shouldShowLibrary prop", async () => {
    fetchMock.get("/api/ee/library", LIBRARY_COLLECTION);
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [LIBRARY_MODELS_COLELCTION, LIBRARY_METRICS_COLELCTION],
    });

    setup(
      { shouldShowLibrary: false },
      createMockTokenFeatures({ data_studio: true }),
    );

    expect(await screen.findByText("Mini Db")).toBeInTheDocument();
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("data")).not.toBeInTheDocument();
    expect(screen.queryByText("metrics")).not.toBeInTheDocument();
  });
});
