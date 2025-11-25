import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupCardEndpoints,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { CollectionContentModel } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";

import { MiniPicker, type MiniPickerProps } from "./MiniPicker";

const collectionItemModels = [
  "dataset",
  "metric",
  "card",
] as CollectionContentModel[];

const setup = async (props: Partial<MiniPickerProps> = {}) => {
  const onChangeSpy = jest.fn();
  const onCloseSpy = jest.fn();

  mockGetBoundingClientRect(); // for virtualization
  const db = createMockDatabase({
    name: "Mini Db",
    id: 1,
    tables: [
      createMockTable({
        id: 1,
        db_id: 1,
        display_name: "weather",
        schema: "public",
      }),
      createMockTable({
        id: 2,
        db_id: 1,
        display_name: "roads",
        schema: "public",
      }),
      createMockTable({
        id: 3,
        db_id: 1,
        display_name: "pokedex",
        schema: "pokemon",
      }),
      createMockTable({
        id: 4,
        db_id: 1,
        display_name: "cards",
        schema: "pokemon",
      }),
      createMockTable({
        id: 5,
        db_id: 1,
        display_name: "digimon",
        schema: "digimon",
      }),
    ],
  });

  const db2 = createMockDatabase({
    name: "Solo Db",
    id: 2,
    tables: [
      createMockTable({
        id: 6,
        db_id: 2,
        display_name: "pride",
        schema: "only",
      }),
      createMockTable({
        id: 7,
        db_id: 2,
        display_name: "prejudice",
        schema: "only",
      }),
    ],
  });

  const db3 = createMockDatabase({
    name: "NoSchema Db",
    id: 3,
    tables: [
      createMockTable({ id: 8, db_id: 3, display_name: "jane", schema: "" }),
      createMockTable({
        id: 9,
        db_id: 3,
        display_name: "elizabeth",
        schema: "",
      }),
      createMockTable({ id: 10, db_id: 3, display_name: "mary", schema: "" }),
      createMockTable({ id: 11, db_id: 3, display_name: "kitty", schema: "" }),
      createMockTable({ id: 12, db_id: 3, display_name: "lydia", schema: "" }),
    ],
  });
  setupDatabasesEndpoints([db, db2, db3]);

  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: "root", name: "Our analytics" }),
    collectionItems: [
      createMockCollectionItem({
        id: 101,
        model: "collection",
        name: "more things",
        collection_id: "root",
        here: collectionItemModels,
      }),
      createMockCollectionItem({
        id: 102,
        model: "card",
        name: "Brighton",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 103,
        model: "dataset",
        name: "Pemberly",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 104,
        model: "document",
        name: "Longbourn",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 105,
        model: "dashboard",
        name: "NetherField",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 106,
        model: "metric",
        name: "Catherine",
        collection_id: "root",
      }),
    ],
  });

  setupCollectionItemsEndpoint({
    collection: createMockCollection({
      id: 101,
      name: "more things",
      here: collectionItemModels,
    }),
    collectionItems: [
      createMockCollectionItem({
        id: 201,
        model: "collection",
        name: "even more things",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 202,
        model: "card",
        name: "Rosings",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 203,
        model: "dataset",
        name: "Meryton",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 204,
        model: "document",
        name: "Lambton",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 205,
        model: "dashboard",
        name: "Hunsford",
        collection_id: 101,
      }),
    ],
    models: ["card", "dataset", "document", "dashboard", "collection"],
  });

  setupSearchEndpoints([
    createMockSearchResult({ id: 301, model: "card", name: "Lucas" }),
    createMockSearchResult({ id: 302, model: "dataset", name: "Forster" }),
    createMockSearchResult({ id: 303, model: "metric", name: "Bingley" }),
    createMockSearchResult({ id: 304, model: "document", name: "Wickham" }),
    createMockSearchResult({ id: 305, model: "collection", name: "Reynolds" }),
  ]);

  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"], {}, true);

  renderWithProviders(
    <MiniPicker
      opened
      models={["table", "dataset", "metric", "card"]}
      onClose={onCloseSpy}
      onChange={onChangeSpy}
      {...props}
    />,
  );
  expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();

  return { onChangeSpy, onCloseSpy };
};

describe("MiniPicker", () => {
  it("renders the MiniPicker", async () => {
    await setup();
    expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();
  });

  it("shows browse when the onBrowseAll prop is provided", async () => {
    await setup({ onBrowseAll: jest.fn() });
    expect(await screen.findByText("Browse all")).toBeInTheDocument();
  });

  it("does not show browse when the onBrowseAll prop is not provided", async () => {
    //@ts-expect-error - using a null value to test absence of prop
    await setup({ onBrowseAll: null });
    expect(screen.queryByText("Browse all")).not.toBeInTheDocument();
  });

  it("records recent items when an item is picked", async () => {
    const { onChangeSpy } = await setup();
    await userEvent.click(await screen.findByText("Mini Db"));
    await userEvent.click(await screen.findByText("public"));
    await userEvent.click(await screen.findByText("roads"));

    expect(onChangeSpy).toHaveBeenCalledWith({
      id: 2,
      model: "table",
      name: "roads",
      db_id: 1,
    });

    const [req] = await findRequests("POST");

    expect(req.url).toContain("/api/activity/recents");
    expect(req.body).toEqual({
      context: "selection",
      model: "table",
      model_id: 2,
    });
  });

  describe("tables", () => {
    it("can pick a table from a db with multiple schemas", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Mini Db"));
      await userEvent.click(await screen.findByText("public"));
      await userEvent.click(await screen.findByText("weather"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 1,
        model: "table",
        name: "weather",
        db_id: 1,
      });
    });

    it("can pick a table from a db with a single schema", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Solo Db"));
      // doesn't show schema
      expect(screen.queryByText("only")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("pride"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 6,
        model: "table",
        name: "pride",
        db_id: 2,
      });
    });

    it("can pick a table from a db with no schemas", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("NoSchema Db"));
      // doesn't show schema
      expect(screen.queryByText("only")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("mary"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 10,
        model: "table",
        name: "mary",
        db_id: 3,
      });
    });

    it("shows proper back headers when navigating into db and schema", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Mini Db"));
      expect(await screen.findByText("Mini Db")).toBeInTheDocument(); // db header
      await userEvent.click(await screen.findByText("pokemon"));
      expect(await screen.findByText("pokemon")).toBeInTheDocument(); // schema header
      expect(await screen.findByText("pokedex")).toBeInTheDocument(); // table
    });

    it("should show a schema when provided a table as a value", async () => {
      await setup({
        value: {
          model: "table",
          id: 4,
          db_id: 1,
          schema: "pokemon",
          name: "cards",
        },
      });
      expect(await screen.findByText("pokemon")).toBeInTheDocument();
      expect(await screen.findByText("cards")).toBeInTheDocument();
      expect(await screen.findByText("pokedex")).toBeInTheDocument();
    });
  });

  describe("collections", () => {
    it("can pick a model", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("more things"));
      await userEvent.click(await screen.findByText("Meryton"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 203,
        model: "dataset",
        name: "Meryton",
      });
    });

    it("can pick a question", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("Brighton"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 102,
        model: "card",
        name: "Brighton",
      });
    });

    it("can pick a metric", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Catherine"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 106,
        model: "metric",
        name: "Catherine",
      });
    });

    it("ignores documents", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      expect(screen.queryByText("Longbourn")).not.toBeInTheDocument();
    });

    it("ignores metrics when the model is missing", async () => {
      await setup({
        models: ["table", "dataset", "card"],
      });
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      expect(screen.queryByText("Catherine")).not.toBeInTheDocument();
    });

    it("should show a collection when provided a card as a value", async () => {
      setupCardEndpoints(
        createMockCard({
          id: 202,
          name: "Rosings",
          collection_id: 101,
          collection: createMockCollection({
            effective_location: "/",
          }),
        }),
      );
      await setup({
        value: {
          id: 202,
          model: "card",
          name: "Rosings",
          database_id: 1,
        },
      });
      expect(await screen.findByText("more things")).toBeInTheDocument();
      expect(await screen.findByText("Rosings")).toBeInTheDocument();
      expect(await screen.findByText("Meryton")).toBeInTheDocument(); // sibling
      expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument(); // document sibling
    });
  });

  describe("search", () => {
    it("shows search results", async () => {
      await setup({ searchQuery: "e" });
      expect(await screen.findByText("Forster")).toBeInTheDocument();
      expect(await screen.findByText("Bingley")).toBeInTheDocument();
    });

    it("properly filters search results", async () => {
      await setup({ searchQuery: "a" });
      expect(await screen.findByText("Lucas")).toBeInTheDocument();
      expect(screen.queryByText("Wickham")).not.toBeInTheDocument();
    });

    it("can pick a search result", async () => {
      const { onChangeSpy } = await setup({ searchQuery: "e" });
      expect(await screen.findByText("Forster")).toBeInTheDocument();
      expect(await screen.findByText("Bingley")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Bingley"));

      expect(onChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 303,
          model: "metric",
          name: "Bingley",
        }),
      );
    });
  });
});
