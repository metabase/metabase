import fetchMock from "fetch-mock";
import { render, renderWithProviders, screen, fireEvent } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
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

describe("SearchResult > Tables", () => {
  it("only tables with initial_sync_status='complete' are clickable", async () => {
    const table = { id: 1, display_name: "Table Name" };
    const database = { id: 1, name: "Database Name" };
    fetchMock.get("path:/api/table/1", table);
    fetchMock.get("path:/api/database/1", database);
    const result = {
      model: "table",
      name: "Complete Table",
      initial_sync_status: "complete",
      table_id: 1,
      database_id: 1,
      getUrl: () => `/table/1`,
      getIcon: () => ({ name: "table" }),
    };

    const onClick = jest.fn();
    renderWithProviders(<SearchResult result={result} onClick={onClick} />);
    const link = screen.getByText("Complete Table");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalled();

    const incompleteResult = {
      model: "table",
      name: "Incomplete Table",
      initial_sync_status: "incomplete",
      table_id: 1,
      database_id: 1,
      getUrl: () => `/table/1`,
      getIcon: () => ({ name: "table" }),
    };
    const incompleteOnClick = jest.fn();
    renderWithProviders(
      <SearchResult result={incompleteResult} onClick={incompleteOnClick} />,
    );
    const incompleteLink = screen.getByText("Incomplete Table");
    fireEvent.click(incompleteLink);
    expect(incompleteOnClick).not.toHaveBeenCalled();
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
