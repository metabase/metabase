import { render, screen } from "@testing-library/react";
import { setupEnterpriseTest } from "__support__/enterprise";
import { createMockSearchResult } from "metabase-types/api/mocks";
import { getIcon, queryIcon } from "__support__/ui";

import type { WrappedResult } from "./types";
import { SearchResult } from "./SearchResult";

const createWrappedSearchResult = (
  options: Partial<WrappedResult>,
): WrappedResult => {
  const result = createMockSearchResult(options);

  return {
    ...result,
    getUrl: options.getUrl ?? (() => "/collection/root"),
    getIcon: options.getIcon ?? (() => ({ name: "folder" })),
    getCollection: options.getCollection ?? (() => result.collection),
  };
};

describe("SearchResult", () => {
  it("renders a search result question item", () => {
    const result = createWrappedSearchResult({
      name: "My Item",
      model: "card",
      description: "My Item Description",
      getIcon: () => ({ name: "table" }),
    });

    render(<SearchResult result={result} />);

    expect(screen.getByText(result.name)).toBeInTheDocument();
    expect(screen.getByText(result.description as string)).toBeInTheDocument();
    expect(getIcon("table")).toBeInTheDocument();
  });

  it("renders a search result collection item", () => {
    const result = createWrappedSearchResult({
      name: "My Folder of Goodies",
      model: "collection",
      collection: {
        id: 1,
        name: "This should not appear",
        authority_level: null,
      },
    });

    render(<SearchResult result={result} />);

    expect(screen.getByText(result.name)).toBeInTheDocument();
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(screen.queryByText(result.collection.name)).not.toBeInTheDocument();
    expect(getIcon("folder")).toBeInTheDocument();
  });
});

describe("SearchResult > Collections", () => {
  const resultInRegularCollection = createWrappedSearchResult({
    name: "My Regular Item",
    collection_authority_level: null,
    collection: {
      id: 1,
      name: "Regular Collection",
      authority_level: null,
    },
  });

  const resultInOfficalCollection = createWrappedSearchResult({
    name: "My Official Item",
    collection_authority_level: "official",
    collection: {
      id: 1,
      name: "Official Collection",
      authority_level: "official",
    },
  });

  describe("OSS", () => {
    it("renders regular collection correctly", () => {
      render(<SearchResult result={resultInRegularCollection} />);
      expect(
        screen.getByText(resultInRegularCollection.name),
      ).toBeInTheDocument();
      expect(screen.getByText("Regular Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("badge")).not.toBeInTheDocument();
    });

    it("renders official collections as regular", () => {
      render(<SearchResult result={resultInOfficalCollection} />);
      expect(
        screen.getByText(resultInOfficalCollection.name),
      ).toBeInTheDocument();
      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("badge")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    const resultInOfficalCollectionEE: WrappedResult = {
      ...resultInOfficalCollection,
      getIcon: () => ({ name: "badge" }),
    };

    beforeAll(() => {
      setupEnterpriseTest();
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={resultInRegularCollection} />);
      expect(
        screen.getByText(resultInRegularCollection.name),
      ).toBeInTheDocument();
      expect(screen.getByText("Regular Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("badge")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", () => {
      render(<SearchResult result={resultInOfficalCollectionEE} />);
      expect(
        screen.getByText(resultInOfficalCollectionEE.name),
      ).toBeInTheDocument();
      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(getIcon("badge")).toBeInTheDocument();
      expect(queryIcon("folder")).not.toBeInTheDocument();
    });
  });
});
