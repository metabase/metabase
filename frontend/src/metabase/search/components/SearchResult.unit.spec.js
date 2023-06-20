import userEvent from "@testing-library/user-event";
import { createMockTable, createMockDatabase } from "metabase-types/api/mocks";
import { setupEnterpriseTest } from "__support__/enterprise";
import {
  setupTableEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { render, renderWithProviders, screen } from "__support__/ui";
import SearchResult from "./SearchResult";

function collection({
  id = 1,
  name = "Marketing",
  authority_level = null,
  getIcon = () => ({ name: "folder" }),
  getUrl = () => `/collection/${id}`,
  getCollection = () => {},
} = {}) {
  const collection = {
    id,
    name,
    authority_level,
    getIcon,
    getUrl,
    getCollection,
    model: "collection",
  };
  collection.collection = collection;
  return collection;
}

const setupTableSearchResult = tableOpts => {
  const TEST_TABLE = createMockTable(tableOpts);
  const TEST_DATABASE = createMockDatabase();
  setupTableEndpoints(TEST_TABLE);
  setupDatabaseEndpoints(TEST_DATABASE);
  const result = {
    model: "table",
    name: TEST_TABLE.name,
    table_id: TEST_TABLE.id,
    database_id: TEST_DATABASE.id,
    getUrl: () => `/table/${TEST_TABLE.id}`,
    getIcon: () => ({ name: "table" }),
    ...tableOpts,
  };
  const onClick = jest.fn();
  renderWithProviders(<SearchResult result={result} onClick={onClick} />);
  const link = screen.getByText(result.name);
  return { link, onClick };
};

describe("SearchResult > Tables", () => {
  it("tables with initial_sync_status='complete' are clickable", async () => {
    const { link, onClick } = setupTableSearchResult({
      name: "Complete Table",
      initial_sync_status: "complete",
    });
    userEvent.click(link);
    expect(onClick).toHaveBeenCalled();
  });

  it("tables with initial_sync_status='incomplete' are not clickable", async () => {
    const { link, onClick } = setupTableSearchResult({
      name: "Incomplete Table",
      initial_sync_status: "incomplete",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("tables with initial_sync_status='aborted' are not clickable", async () => {
    const { link, onClick } = setupTableSearchResult({
      name: "Aborted Table",
      initial_sync_status: "aborted",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("SearchResult > Collections", () => {
  const regularCollection = collection();

  describe("OSS", () => {
    const officialCollection = collection({
      authority_level: "official",
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={regularCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });

    it("renders official collections as regular", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    const officialCollection = collection({
      authority_level: "official",
      getIcon: () => ({ name: "badge" }),
    });

    beforeAll(() => {
      setupEnterpriseTest();
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={regularCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("badge icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).not.toBeInTheDocument();
    });
  });
});
