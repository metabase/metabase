import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type {
  Database,
  DatabaseId,
  RecentItem,
  SearchResult,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockRecentTableDatabaseInfo,
  createMockRecentTableItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import { DataPickerModal } from "./DataPickerModal";
import type { DataPickerValue } from "./types";

type SetupOpts = {
  title?: string;
  value?: DataPickerValue;
  databaseId?: DatabaseId;
  databases?: Database[];
  recentItems?: RecentItem[];
  searchItems?: SearchResult[];
};

async function setup({
  title = "Pick your starting data",
  value,
  databaseId,
  databases = [createMockDatabase({ id: 1, name: "DB 1" })],
  recentItems = [],
  searchItems = [],
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  const onChange = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(databases);

  const collections = [
    createMockCollection({ id: 2, name: "Collection A" }),
    createMockCollection({ id: 3, name: "Collection B" }),
  ];
  setupCollectionByIdEndpoint({ collections });
  setupRecentViewsAndSelectionsEndpoints(recentItems, ["selections"]);
  setupSearchEndpoints(searchItems);

  renderWithProviders(
    <DataPickerModal
      title={title}
      value={value}
      onlyDatabaseId={databaseId}
      onChange={onChange}
      onClose={onClose}
    />,
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
});
