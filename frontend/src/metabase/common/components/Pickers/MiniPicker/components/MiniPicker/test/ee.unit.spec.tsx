import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTable,
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
  is_library_root: true,
});

const LIBRARY_METRICS_COLLECTION = createMockCollectionItem({
  name: "metrics",
  type: "library-metrics",
  model: "collection",
  id: 1339,
  here: ["metric"],
  is_library_root: true,
});

describe("library", () => {
  it("should default to the library if it's available", async () => {
    fetchMock.get("path:/api/ee/library", LIBRARY_COLLECTION);
    setupCollectionItemsEndpoint({
      collection: LIBRARY_COLLECTION,
      collectionItems: [LIBRARY_DATA_COLLECTION, LIBRARY_METRICS_COLLECTION],
    });

    await setup(
      {},
      { tokenFeatures: createMockTokenFeatures({ library: true }) },
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

    await setup(
      { models: ["dataset", "metric"] },
      { tokenFeatures: createMockTokenFeatures({ library: true }) },
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

    await setup(
      { models: ["dataset", "metric"] },
      { tokenFeatures: createMockTokenFeatures({ library: true }) },
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

    await setup(
      { shouldShowLibrary: false },
      { tokenFeatures: createMockTokenFeatures({ library: true }) },
    );

    expect(await screen.findByText("Mini Db")).toBeInTheDocument();
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("data")).not.toBeInTheDocument();
    expect(screen.queryByText("metrics")).not.toBeInTheDocument();
  });

  describe("published tables", () => {
    const PUBLISHED_TABLE_ITEMS = [
      createMockCollectionItem({
        id: 13,
        model: "table",
        name: "Orders",
        database_id: 1,
        collection_id: LIBRARY_DATA_COLLECTION.id,
      }),
      createMockCollectionItem({
        id: 14,
        model: "table",
        name: "Products",
        database_id: 1,
        collection_id: LIBRARY_DATA_COLLECTION.id,
      }),
    ];

    const setupPublishedTables = ({ hasMetrics = false } = {}) => {
      fetchMock.get("path:/api/ee/library", {
        ...LIBRARY_COLLECTION,
        below: hasMetrics ? ["table", "metric"] : ["table"],
      });
      setupCollectionItemsEndpoint({
        collection: LIBRARY_COLLECTION,
        collectionItems: [
          { ...LIBRARY_DATA_COLLECTION, here: ["table"] },
          {
            ...LIBRARY_METRICS_COLLECTION,
            here: hasMetrics ? ["metric"] : undefined,
          },
        ],
      });
      setupCollectionItemsEndpoint({
        collection: LIBRARY_DATA_COLLECTION,
        collectionItems: PUBLISHED_TABLE_ITEMS,
      });
    };

    it("should list and pick published tables when nothing is selected", async () => {
      setupPublishedTables();

      const { onChangeSpy } = await setup(
        {},
        { tokenFeatures: createMockTokenFeatures({ library: true }) },
      );

      const miniPicker = screen.getByTestId("mini-picker");
      expect(await within(miniPicker).findByText("Orders")).toBeInTheDocument();
      expect(within(miniPicker).queryByText("metrics")).not.toBeInTheDocument();
      await userEvent.click(within(miniPicker).getByText("Products"));

      expect(onChangeSpy).toHaveBeenCalledTimes(1);
      expect(onChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 14, model: "table", name: "Products" }),
      );
    });

    it("should show the published tables when a published table is selected", async () => {
      // with metrics in the library, the picker would open at the library root without a value
      setupPublishedTables({ hasMetrics: true });
      setupTableEndpoints(
        createMockTable({
          id: 13,
          db_id: 1,
          display_name: "Orders",
          collection: createMockCollection({
            id: LIBRARY_DATA_COLLECTION.id,
            name: LIBRARY_DATA_COLLECTION.name,
            type: "library-data",
            location: `/${LIBRARY_COLLECTION.id}/`,
          }),
        }),
      );

      const { onChangeSpy } = await setup(
        {
          value: {
            model: "table",
            id: 13,
            // @ts-expect-error - needed to make compatible with minipicker and entity picker
            db_id: 1,
            name: "Orders",
          },
        },
        { tokenFeatures: createMockTokenFeatures({ library: true }) },
      );

      const miniPicker = screen.getByTestId("mini-picker");
      expect(
        await within(miniPicker).findByText("Products"),
      ).toBeInTheDocument();
      expect(within(miniPicker).getByText("Orders")).toBeInTheDocument();
      expect(within(miniPicker).queryByText("metrics")).not.toBeInTheDocument();
      await userEvent.click(within(miniPicker).getByText("Products"));

      expect(onChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 14, model: "table", name: "Products" }),
      );
    });
  });
});
