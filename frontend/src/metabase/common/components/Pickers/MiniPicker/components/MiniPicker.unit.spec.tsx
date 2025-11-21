import userEvent from "@testing-library/user-event";

import {
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { CollectionContentModel } from "metabase-types/api";
import {
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
      createMockTable({ id: 1, display_name: "weather", schema: "public" }),
      createMockTable({ id: 2, display_name: "roads", schema: "public" }),
      createMockTable({ id: 3, display_name: "pokedex", schema: "pokemon" }),
      createMockTable({ id: 4, display_name: "cards", schema: "pokemon" }),
      createMockTable({ id: 5, display_name: "digimon", schema: "digimon" }),
    ],
  });

  const db2 = createMockDatabase({
    name: "Solo Db",
    id: 2,
    tables: [
      createMockTable({ id: 6, display_name: "pride", schema: "only" }),
      createMockTable({ id: 7, display_name: "prejudice", schema: "only" }),
    ],
  });

  const db3 = createMockDatabase({
    name: "NoSchema Db",
    id: 3,
    tables: [
      createMockTable({ id: 8, display_name: "jane", schema: "" }),
      createMockTable({ id: 9, display_name: "elizabeth", schema: "" }),
      createMockTable({ id: 10, display_name: "mary", schema: "" }),
      createMockTable({ id: 11, display_name: "kitty", schema: "" }),
      createMockTable({ id: 12, display_name: "lydia", schema: "" }),
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

    it("ignores documents", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      expect(screen.queryByText("Longbourn")).not.toBeInTheDocument();
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
