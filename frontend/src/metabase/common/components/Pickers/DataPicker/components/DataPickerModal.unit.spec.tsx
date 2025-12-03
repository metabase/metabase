import {
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DatabaseId, RecentItem, SearchResult } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockRecentTableDatabaseInfo,
  createMockRecentTableItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import type { DataPickerValue } from "../types";

import { DataPickerModal } from "./DataPickerModal";

type SetupOpts = {
  title?: string;
  value?: DataPickerValue;
  databaseId?: DatabaseId;
  recentItems?: RecentItem[];
  searchItems?: SearchResult[];
};

function setup({
  title = "Pick your starting data",
  value,
  databaseId,
  recentItems = [],
  searchItems = [],
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onClose = jest.fn();

  setupRecentViewsAndSelectionsEndpoints(recentItems, ["selections"]);
  setupSearchEndpoints(searchItems);

  renderWithProviders(
    <DataPickerModal
      title={title}
      value={value}
      databaseId={databaseId}
      onChange={onChange}
      onClose={onClose}
    />,
  );

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
      setup({
        recentItems,
        searchItems,
      });
      expect(
        await screen.findByRole("tab", { name: /Recents/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("DB 1 table")).toBeInTheDocument();
      expect(screen.getByText("DB 1 question")).toBeInTheDocument();
      expect(screen.getByText("DB 2 table")).toBeInTheDocument();
      expect(screen.getByText("DB 2 question")).toBeInTheDocument();
    });

    it("should show tables and cards for the selected database in recent items (metabase#52523)", async () => {
      setup({
        databaseId: 1,
        recentItems,
        searchItems,
      });
      expect(
        await screen.findByRole("tab", { name: /Recents/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("DB 1 table")).toBeInTheDocument();
      expect(screen.getByText("DB 1 question")).toBeInTheDocument();
      expect(screen.queryByText("DB 2 table")).not.toBeInTheDocument();
      expect(screen.queryByText("DB 2 question")).not.toBeInTheDocument();
    });
  });
});
