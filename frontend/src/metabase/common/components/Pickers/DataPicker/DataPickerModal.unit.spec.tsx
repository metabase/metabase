import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type {
  Collection,
  CollectionItem,
  Database,
  DatabaseId,
  RecentItem,
  SearchResult,
  User,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockRecentTableDatabaseInfo,
  createMockRecentTableItem,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  ADMIN_PERSONAL_COLLECTION,
  ADMIN_USER,
  FIRST_COLLECTION,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION,
  NORMAL_USER,
  ROOT,
  createCardFixtures,
  createCardSearchResults,
  expectSearchResults,
  findSearchResult,
  getCollectionItems,
  getLastSearchParams,
  getRootItem,
  getScopeRadio,
  getSearchScopeSelector,
  typeSearchText,
} from "../tests/search";

import { DataPickerModal } from "./DataPickerModal";
import type { DataPickerValue } from "./types";

type SetupOpts = {
  title?: string;
  value?: DataPickerValue;
  databaseId?: DatabaseId;
  databases?: Database[];
  recentItems?: RecentItem[];
  searchItems?: SearchResult[];
  currentUser?: User;
  collections?: Collection[];
  collectionItems?: { collection: Collection; items: CollectionItem[] }[];
  hasNestedQueries?: boolean;
};

async function setup({
  title = "Pick your starting data",
  value,
  databaseId,
  databases = [createMockDatabase({ id: 1, name: "DB 1" })],
  recentItems = [],
  searchItems = [],
  currentUser,
  collections = [
    createMockCollection({ id: 2, name: "Collection A" }),
    createMockCollection({ id: 3, name: "Collection B" }),
  ],
  collectionItems = [],
  hasNestedQueries = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  process.env.OVERSCAN = "20";
  const onChange = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(databases);

  setupCollectionByIdEndpoint({ collections });
  setupCollectionsEndpoints({
    collections,
    rootCollection: collections.find(({ id }) => id === "root"),
  });
  collectionItems.forEach(({ collection, items }) =>
    setupCollectionItemsEndpoint({ collection, collectionItems: items }),
  );
  setupRecentViewsAndSelectionsEndpoints(recentItems, ["selections"]);
  setupSearchEndpoints(searchItems, undefined, { filterByScope: true });

  renderWithProviders(
    <DataPickerModal
      title={title}
      value={value}
      onlyDatabaseId={databaseId}
      onChange={onChange}
      onClose={onClose}
    />,
    {
      storeInitialState: createMockState({
        ...(currentUser ? { currentUser } : {}),
        settings: mockSettings({ "enable-nested-queries": hasNestedQueries }),
      }),
    },
  );

  await waitForLoaderToBeRemoved();

  return { onChange, onClose };
}

describe("DataPickerModal", () => {
  describe("recents", () => {
    const recentItems = [
      createMockRecentTableItem({
        id: 10,
        name: "db_1_table",
        display_name: "DB 1 table",
        database: createMockRecentTableDatabaseInfo({
          id: 1,
        }),
      }),
      createMockRecentTableItem({
        id: 20,
        name: "db_2_table",
        display_name: "DB 2 table",
        database: createMockRecentTableDatabaseInfo({
          id: 2,
        }),
      }),
      createMockRecentCollectionItem({
        id: 30,
        name: "DB 1 question",
        database_id: 1,
      }),
      createMockRecentCollectionItem({
        id: 40,
        name: "DB 2 question",
        database_id: 2,
      }),
    ];

    const searchItems = [
      createMockSearchResult({
        id: 10,
        model: "table",
      }),
      createMockSearchResult({
        id: 20,
        model: "table",
      }),
      createMockSearchResult({
        id: 30,
        model: "card",
      }),
      createMockSearchResult({
        id: 40,
        model: "card",
      }),
    ];

    it("should show tables and cards for all databases in recent items if the database is not specified", async () => {
      await setup({
        recentItems,
        searchItems,
      });
      await userEvent.click(await screen.findByText(/Recent items/));
      await waitForLoaderToBeRemoved();
      expect(await screen.findByText(/DB 1 table/)).toBeInTheDocument();
      expect(await screen.findByText(/DB 1 question/)).toBeInTheDocument();
      expect(await screen.findByText(/DB 2 table/)).toBeInTheDocument();
      expect(await screen.findByText(/DB 2 question/)).toBeInTheDocument();
    });

    it("should show tables and cards for the selected database in recent items (metabase#52523)", async () => {
      await setup({
        databaseId: 1,
        recentItems,
        searchItems,
      });
      await userEvent.click(await screen.findByText(/Recent items/));
      expect(await screen.findByText("DB 1 table")).toBeInTheDocument();
      expect(await screen.findByText("DB 1 question")).toBeInTheDocument();
      expect(screen.queryByText("DB 2 table")).not.toBeInTheDocument();
      expect(screen.queryByText("DB 2 question")).not.toBeInTheDocument();
    });
  });

  describe("search", () => {
    it("should exclude other users' personal collections from search results", async () => {
      await setup({
        searchItems: [
          createMockSearchResult({ id: 1, name: "accounts", model: "table" }),
        ],
      });

      await userEvent.type(
        await screen.findByPlaceholderText(/search/i),
        "accounts",
      );

      await waitFor(() => {
        expect(fetchMock.callHistory.lastCall("path:/api/search")).toBeTruthy();
      });

      const call = fetchMock.callHistory.lastCall("path:/api/search");
      const url = new URL(checkNotNull(call?.request?.url));
      expect(url.searchParams.get("filter_items_in_personal_collection")).toBe(
        "exclude-others",
      );
    });
  });
  describe("table search", () => {
    const databases = [createMockDatabase({ id: 1, name: "Sample Database" })];
    const searchItems = [
      createMockSearchResult({
        id: 11,
        name: "Product reviews",
        model: "table",
        database_id: 1,
        collection: ROOT,
      }),
      createMockSearchResult({
        id: 3,
        name: "Products",
        model: "table",
        database_id: 1,
        collection: ROOT,
      }),
      createMockSearchResult({
        id: 30,
        name: "Product question",
        model: "card",
        collection: ROOT,
      }),
    ];

    it("should select a table from the search results in the databases scope", async () => {
      const { onChange, onClose } = await setup({ databases, searchItems });

      await userEvent.click(await screen.findByText("Databases"));
      await typeSearchText("prod");

      expect(getScopeRadio("Databases")).toBeChecked();
      expect(getScopeRadio("Everywhere")).not.toBeChecked();
      expect(getLastSearchParams().getAll("models")).toEqual(["table"]);
      expect(getLastSearchParams().get("q")).toBe("prod");
      await expectSearchResults(["Product reviews", "Products"]);

      await userEvent.click(await findSearchResult("Products"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(3);
      expect(onClose).toHaveBeenCalled();
    });

    it("should select a table from the search results everywhere", async () => {
      const { onChange } = await setup({ databases, searchItems });

      await userEvent.click(await screen.findByText("Databases"));
      await typeSearchText("prod");
      await expectSearchResults(["Product reviews", "Products"]);
      await userEvent.click(getScopeRadio("Everywhere"));

      expect(getScopeRadio("Everywhere")).toBeChecked();
      await expectSearchResults([
        "Product reviews",
        "Products",
        "Product question",
      ]);
      expect(getLastSearchParams().getAll("models")).toEqual([
        "card",
        "dataset",
        "metric",
        "table",
      ]);
      expect(getLastSearchParams().get("collection")).toBeNull();

      await userEvent.click(await findSearchResult("Products"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it("should restore the database path when the search is cleared", async () => {
      await setup({
        databases: [
          createMockDatabase({
            id: 1,
            name: "Sample Database",
            tables: [createMockTable({ id: 10, db_id: 1, schema: "PUBLIC" })],
          }),
          createMockDatabase({
            id: 2,
            name: "Second Database",
            tables: [
              createMockTable({
                id: 20,
                db_id: 2,
                display_name: "Second table",
                schema: "PUBLIC",
              }),
            ],
          }),
        ],
        searchItems,
      });

      await userEvent.click(await screen.findByText("Databases"));
      await userEvent.click(await screen.findByText("Second Database"));
      expect(await screen.findByText("Second table")).toBeInTheDocument();
      await typeSearchText("1");
      expect(screen.queryByText("Second table")).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("clear-search"));

      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: /Second Database/ }),
        ).toHaveAttribute("data-active", "true"),
      );
      expect(
        screen.getByRole("link", { name: /Sample Database/ }),
      ).not.toHaveAttribute("data-active", "true");
      expect(screen.getByText("Second table")).toBeInTheDocument();
      expect(screen.queryByText(/Search results for/)).not.toBeInTheDocument();
    });
  });

  describe("card search", () => {
    it("should search the current collection for a normal user", async () => {
      const cards = createCardFixtures([
        { collection: ROOT, namePrefix: "Root" },
        { collection: FIRST_COLLECTION, namePrefix: "Regular" },
        {
          collection: NORMAL_PERSONAL_COLLECTION,
          namePrefix: "Normal personal collection",
        },
        // a sub-collection of First collection: its cards are in its scope too
        {
          collection: createMockCollection({
            id: 12,
            name: "Nested collection",
            location: `/${FIRST_COLLECTION_ID}/`,
          }),
          namePrefix: "Regular nested",
        },
      ]);
      const searchItems = createCardSearchResults(cards);
      const itemsIn = (collection: Collection) =>
        getCollectionItems(cards, collection);
      await setup({
        currentUser: NORMAL_USER,
        collections: [ROOT, FIRST_COLLECTION, NORMAL_PERSONAL_COLLECTION],
        collectionItems: [
          {
            collection: ROOT,
            items: [
              createMockCollectionItem({
                id: FIRST_COLLECTION_ID,
                name: FIRST_COLLECTION.name,
                model: "collection",
                here: ["card", "dataset", "metric"],
                below: ["card", "dataset", "metric"],
              }),
              ...itemsIn(ROOT),
            ],
          },
          { collection: FIRST_COLLECTION, items: itemsIn(FIRST_COLLECTION) },
          {
            collection: NORMAL_PERSONAL_COLLECTION,
            items: itemsIn(NORMAL_PERSONAL_COLLECTION),
          },
        ],
        searchItems,
      });

      // Our analytics can't be a search scope
      await userEvent.click(await screen.findByText("Our analytics"));
      await typeSearchText("2");
      expect(getScopeRadio("Everywhere")).toBeChecked();
      expect(getLastSearchParams().get("collection")).toBeNull();
      expect(getLastSearchParams().getAll("models")).toEqual([
        "card",
        "dataset",
        "metric",
        "table",
      ]);
      await expectSearchResults([
        "Root question 2",
        "Root model 2",
        "Root metric 2",
        "Regular question 2",
        "Regular model 2",
        "Regular metric 2",
        "Normal personal collection question 2",
        "Normal personal collection model 2",
        "Normal personal collection metric 2",
        "Regular nested question 2",
        "Regular nested model 2",
        "Regular nested metric 2",
      ]);

      await userEvent.click(getRootItem(/Our analytics/));
      await userEvent.click(await screen.findByText("First collection"));
      await typeSearchText("1");
      expect(getScopeRadio("First collection")).toBeChecked();
      expect(getScopeRadio("Everywhere")).not.toBeChecked();
      expect(getLastSearchParams().get("collection")).toBe(
        String(FIRST_COLLECTION.id),
      );
      await expectSearchResults([
        "Regular question 1",
        "Regular model 1",
        "Regular metric 1",
        "Regular nested question 1",
        "Regular nested model 1",
        "Regular nested metric 1",
      ]);

      await userEvent.click(getRootItem(/Personal Collection/));
      await typeSearchText("2");
      expect(getScopeRadio(/Robert Tableton/)).toBeChecked();
      expect(getLastSearchParams().get("collection")).toBe(
        String(NORMAL_PERSONAL_COLLECTION.id),
      );
      await expectSearchResults([
        "Normal personal collection question 2",
        "Normal personal collection model 2",
        "Normal personal collection metric 2",
      ]);
    });

    it("should only search everywhere from all personal collections", async () => {
      const cards = createCardFixtures([
        { collection: ROOT, namePrefix: "Root" },
        {
          collection: ADMIN_PERSONAL_COLLECTION,
          namePrefix: "Admin personal collection",
        },
      ]);
      const searchItems = createCardSearchResults(cards);
      await setup({
        currentUser: ADMIN_USER,
        collections: [
          ROOT,
          ADMIN_PERSONAL_COLLECTION,
          NORMAL_PERSONAL_COLLECTION,
        ],
        collectionItems: [
          { collection: ROOT, items: [] },
          {
            collection: ADMIN_PERSONAL_COLLECTION,
            items: getCollectionItems(cards, ADMIN_PERSONAL_COLLECTION),
          },
        ],
        searchItems,
      });

      await userEvent.click(
        await screen.findByText("All personal collections"),
      );
      expect(
        await screen.findByText("Robert Tableton's Personal Collection"),
      ).toBeInTheDocument();
      await typeSearchText("root");
      expect(getScopeRadio("Everywhere")).toBeChecked();
      expect(
        getSearchScopeSelector().queryByRole("radio", {
          name: "All personal collections",
        }),
      ).not.toBeInTheDocument();
      expect(getSearchScopeSelector().getAllByRole("radio")).toHaveLength(1);

      await expectSearchResults([
        "Root question 1",
        "Root question 2",
        "Root model 1",
        "Root model 2",
        "Root metric 1",
        "Root metric 2",
      ]);
      expect(getLastSearchParams().get("collection")).toBeNull();
    });
  });

  describe("disabled databases", () => {
    const databases = [
      createMockDatabase({ id: 1, name: "DB 1" }),
      createMockDatabase({ id: 2, name: "DB 2" }),
    ];

    it("explains why a database from another database is disabled when locked to one database", async () => {
      await setup({ databaseId: 1, databases });

      await userEvent.click(await screen.findByText("Databases"));

      const disabledDatabase = await screen.findByRole("link", {
        name: /DB 2/,
      });
      expect(disabledDatabase).toHaveAttribute("data-disabled", "true");

      await userEvent.hover(disabledDatabase);

      expect(
        await screen.findByText(
          "You can't combine data from different databases.",
        ),
      ).toBeInTheDocument();
    });

    it("does not show a tooltip on the database the picker is locked to", async () => {
      await setup({ databaseId: 1, databases });

      await userEvent.click(await screen.findByText("Databases"));

      const enabledDatabase = await screen.findByRole("link", { name: /DB 1/ });
      expect(enabledDatabase).not.toHaveAttribute("data-disabled", "true");

      await userEvent.hover(enabledDatabase);

      expect(
        screen.queryByText("You can't combine data from different databases."),
      ).not.toBeInTheDocument();
    });
  });

  describe("models", () => {
    const SAMPLE_DATABASE = createMockDatabase({
      id: 1,
      name: "Sample Database",
      tables: ["Orders", "People", "Products", "Reviews"].map((name, index) =>
        createMockTable({
          id: 10 + index,
          db_id: 1,
          schema: "PUBLIC",
          display_name: name,
        }),
      ),
    });
    const COLLECTION_ITEMS = [
      createMockCollectionItem({
        id: 1,
        name: "Orders Model",
        model: "dataset",
        collection_id: null,
      }),
      createMockCollectionItem({
        id: 2,
        name: "Orders, Count",
        model: "card",
        collection_id: null,
      }),
    ];
    const SEARCH_ITEMS = [
      createMockSearchResult({
        id: 1,
        name: "Orders Model",
        model: "dataset",
        collection: ROOT,
      }),
      createMockSearchResult({
        id: 2,
        name: "Orders, Count",
        model: "card",
        collection: ROOT,
      }),
      createMockSearchResult({
        id: 10,
        name: "Orders",
        model: "table",
        database_id: 1,
        collection: ROOT,
      }),
    ];

    function setupModels({ hasNestedQueries }: { hasNestedQueries: boolean }) {
      return setup({
        hasNestedQueries,
        databases: [SAMPLE_DATABASE],
        collections: [ROOT],
        collectionItems: [{ collection: ROOT, items: COLLECTION_ITEMS }],
        searchItems: SEARCH_ITEMS,
      });
    }

    const getSearchResults = () =>
      within(screen.getByTestId("item-picker-level-1")).getAllByTestId(
        "result-item",
      );

    it("lists models with questions in a collection, and only tables in a database", async () => {
      const { onChange } = await setupModels({ hasNestedQueries: true });

      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Orders Model")).toBeInTheDocument();
      expect(screen.getByText("Orders, Count")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Databases"));
      await userEvent.click(await screen.findByText("Sample Database"));
      for (const table of ["Orders", "People", "Products", "Reviews"]) {
        expect(await screen.findByText(table)).toBeInTheDocument();
      }
      expect(screen.queryByText("Orders, Count")).not.toBeInTheDocument();

      await typeSearchText("Ord");
      expect(getLastSearchParams().getAll("models")).toEqual(["table"]);
      await expectSearchResults(["Orders"]);
      expect(getSearchResults()[0]).toHaveAttribute("data-model-type", "table");

      await userEvent.click(getScopeRadio("Everywhere"));
      await expectSearchResults(["Orders Model", "Orders, Count", "Orders"]);
      expect(getLastSearchParams().getAll("models")).toEqual([
        "card",
        "dataset",
        "metric",
        "table",
      ]);
      expect(
        getSearchResults().map((item) => item.getAttribute("data-model-type")),
      ).toEqual(["dataset", "card", "table"]);

      await userEvent.click(await findSearchResult("Orders Model"));
      expect(onChange).toHaveBeenCalledTimes(1);
      // On 65, the picker reports a picked model as its virtual table id
      expect(onChange).toHaveBeenCalledWith("card__1");
    });

    it("does not list models when nested queries are disabled", async () => {
      await setupModels({ hasNestedQueries: false });

      await userEvent.click(await screen.findByText("Sample Database"));
      for (const table of ["Orders", "People", "Products", "Reviews"]) {
        expect(await screen.findByText(table)).toBeInTheDocument();
      }

      await typeSearchText("Ord");
      await userEvent.click(getScopeRadio("Everywhere"));
      await waitFor(() =>
        expect(getLastSearchParams().getAll("models")).toEqual(["table"]),
      );
      expect(getLastSearchParams().get("collection")).toBeNull();
      await expectSearchResults(["Orders"]);
      expect(getSearchResults()[0]).toHaveAttribute("data-model-type", "table");
      expect(screen.queryByText("Orders Model")).not.toBeInTheDocument();
    });
  });
});
