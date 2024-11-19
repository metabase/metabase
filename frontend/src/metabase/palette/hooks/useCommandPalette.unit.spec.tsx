import type React from "react";

import { render, screen } from "__support__/ui";
import Search from "metabase/entities/search";
import { Text } from "metabase/ui";
import {
  createMockCollection,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import {
  getRecentItemSubtext,
  getSearchResultSubtext,
} from "./useCommandPalette";

const setup = (child: React.ReactNode) => {
  render(<Text>{child}</Text>);
};

describe("useCommandPalette", () => {
  describe("getSearchResultSubtext", () => {
    it("should work for model indexes", async () => {
      const mockSearchResult = Search.wrapEntity(
        createMockSearchResult({
          model: "indexed-entity",
          model_name: "foo",
        }),
      );
      setup(getSearchResultSubtext(mockSearchResult));

      expect(await screen.findByText(/a record in/)).toBeInTheDocument();
      expect(await screen.findByText(/foo/)).toBeInTheDocument();
      expect(
        await screen.findByRole("img", { name: /model/ }),
      ).toBeInTheDocument();
    });

    it("should work for cards", async () => {
      const mockSearchResult = Search.wrapEntity(
        createMockSearchResult({
          model: "card",
          collection: createMockCollection({
            name: "Foo Collection",
            id: 2,
          }),
        }),
      );
      setup(getSearchResultSubtext(mockSearchResult));

      expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
    });

    it("should work for tables", async () => {
      const mockSearchResult = Search.wrapEntity(
        createMockSearchResult({
          model: "table",
          collection: createMockCollection({ id: undefined, name: undefined }),
          database_name: "Bar Database",
        }),
      );
      setup(getSearchResultSubtext(mockSearchResult));

      expect(await screen.findByText("Bar Database")).toBeInTheDocument();
    });

    it("should should include the schema name in table search results when provided", async () => {
      const mockSearchResult = Search.wrapEntity(
        createMockSearchResult({
          model: "table",
          collection: createMockCollection({ id: undefined, name: undefined }),
          database_name: "Bar Database",
          table_schema: "My Schema",
        }),
      );
      setup(getSearchResultSubtext(mockSearchResult));

      expect(
        await screen.findByText("Bar Database (My Schema)"),
      ).toBeInTheDocument();
    });
  });

  describe("getRecentItemSubtext", () => {
    it("should work for cards", async () => {
      const mockRecentItem = createMockRecentCollectionItem();
      const mockRecentTableItem = createMockRecentTableItem();

      expect(getRecentItemSubtext(mockRecentItem)).toBe("My Cool Collection");
      expect(getRecentItemSubtext(mockRecentTableItem)).toBe(
        "My Cool Database (PUBLIC)",
      );
    });
  });
});
