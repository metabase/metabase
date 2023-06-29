import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { setupEnterpriseTest } from "__support__/enterprise";
import {
  setupTableEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import {
  createMockSearchResult,
  createMockTable,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { getIcon, renderWithProviders, queryIcon } from "__support__/ui";

import { InitialSyncStatus } from "metabase-types/api";
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

describe("SearchResult > Tables", () => {
  interface SetupOpts {
    name: string;
    initial_sync_status: InitialSyncStatus;
  }

  const setup = (setupOpts: SetupOpts) => {
    const TEST_TABLE = createMockTable(setupOpts);
    const TEST_DATABASE = createMockDatabase();
    setupTableEndpoints(TEST_TABLE);
    setupDatabaseEndpoints(TEST_DATABASE);
    const result = createWrappedSearchResult({
      model: "table",
      table_id: TEST_TABLE.id,
      database_id: TEST_DATABASE.id,
      getUrl: () => `/table/${TEST_TABLE.id}`,
      getIcon: () => ({ name: "table" }),
      ...setupOpts,
    });
    const onClick = jest.fn();
    renderWithProviders(<SearchResult result={result} onClick={onClick} />);
    const link = screen.getByText(result.name);
    return { link, onClick };
  };

  it("tables with initial_sync_status='complete' are clickable", () => {
    const { link, onClick } = setup({
      name: "Complete Table",
      initial_sync_status: "complete",
    });
    userEvent.click(link);
    expect(onClick).toHaveBeenCalled();
  });

  it("tables with initial_sync_status='incomplete' are not clickable", () => {
    const { link, onClick } = setup({
      name: "Incomplete Table",
      initial_sync_status: "incomplete",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("tables with initial_sync_status='aborted' are not clickable", () => {
    const { link, onClick } = setup({
      name: "Aborted Table",
      initial_sync_status: "aborted",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
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
