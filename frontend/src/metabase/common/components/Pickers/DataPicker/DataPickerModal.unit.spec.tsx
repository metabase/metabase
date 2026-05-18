import userEvent from "@testing-library/user-event";

import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks/activity";
import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import { setupDatabasesEndpoints } from "__support__/server-mocks/database";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui-with-store";
import type { DatabaseId, RecentItem, SearchResult } from "metabase-types/api";
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
  recentItems?: RecentItem[];
  searchItems?: SearchResult[];
};

async function setup({
  title = "Pick your starting data",
  value,
  databaseId,
  recentItems = [],
  searchItems = [],
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  const onChange = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints([createMockDatabase({ id: 1, name: "DB 1" })]);

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
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
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
      expect(consoleWarnSpy).toHaveBeenCalledWith({
        status: 404,
        data: "Collection not found",
      });
      consoleWarnSpy.mockRestore();
    });

    it("should show tables and cards for the selected database in recent items (metabase#52523)", async () => {
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
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
      expect(consoleWarnSpy).toHaveBeenCalledWith({
        status: 404,
        data: "Collection not found",
      });
      consoleWarnSpy.mockRestore();
    });
  });
});
