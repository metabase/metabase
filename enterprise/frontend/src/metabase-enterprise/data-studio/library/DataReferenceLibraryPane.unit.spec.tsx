import userEvent from "@testing-library/user-event";

import {
  setupLibraryEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { DatabaseId, SearchResult } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";

import { DataReferenceLibraryPane } from "./DataReferenceLibraryPane";

const TARGET_DB_ID = 1;

const libraryTable = (overrides: Partial<SearchResult>): SearchResult =>
  createMockSearchResult({
    model: "table",
    initial_sync_status: "complete",
    ...overrides,
  });

type SetupOpts = {
  tables?: SearchResult[];
  queryDatabaseId?: DatabaseId;
};

const setup = (opts: SetupOpts = {}) => {
  const { tables = [] } = opts;
  const queryDatabaseId =
    "queryDatabaseId" in opts ? opts.queryDatabaseId : TARGET_DB_ID;
  const onItemClick = jest.fn();
  const onBack = jest.fn();
  const onClose = jest.fn();

  setupLibraryEndpoints(true);
  setupSearchEndpoints(tables);

  renderWithProviders(
    <DataReferenceLibraryPane
      type="library"
      onBack={onBack}
      onClose={onClose}
      onItemClick={onItemClick}
      queryDatabaseId={queryDatabaseId}
    />,
  );

  return { onItemClick, onBack, onClose };
};

describe("DataReferenceLibraryPane", () => {
  it("separates the query database's tables from the tables in other databases", async () => {
    setup({
      tables: [
        libraryTable({ id: 1, name: "Zebra", database_id: TARGET_DB_ID }),
        libraryTable({ id: 2, name: "Apple", database_id: TARGET_DB_ID }),
        libraryTable({ id: 3, name: "Mango", database_id: 2 }),
        libraryTable({ id: 4, name: "Banana", database_id: 3 }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const currentDatabase = within(
      screen.getByTestId("library-tables-current-database"),
    );
    expect(currentDatabase.getByText("Apple")).toBeInTheDocument();
    expect(currentDatabase.getByText("Zebra")).toBeInTheDocument();
    expect(currentDatabase.getAllByRole("listitem")).toHaveLength(2);

    const otherDatabases = within(
      screen.getByTestId("library-tables-other-databases"),
    );
    expect(otherDatabases.getByText("Banana")).toBeInTheDocument();
    expect(otherDatabases.getByText("Mango")).toBeInTheDocument();
    expect(otherDatabases.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows a 'No tables' message in this database when only other databases have tables", async () => {
    setup({
      tables: [
        libraryTable({ id: 1, name: "Mango", database_id: 2 }),
        libraryTable({ id: 2, name: "Banana", database_id: 3 }),
      ],
    });
    await waitForLoaderToBeRemoved();

    // "In this database" is always shown, with a "No tables" message
    const currentDatabase = within(
      screen.getByTestId("library-tables-current-database"),
    );
    expect(screen.getByText("In this database")).toBeInTheDocument();
    expect(currentDatabase.getByText("No tables")).toBeInTheDocument();
    expect(currentDatabase.queryAllByRole("listitem")).toHaveLength(0);

    // "In other databases" is shown because those databases have tables
    const otherDatabases = within(
      screen.getByTestId("library-tables-other-databases"),
    );
    expect(screen.getByText("In other databases")).toBeInTheDocument();
    expect(otherDatabases.getByText("Mango")).toBeInTheDocument();
    expect(otherDatabases.getByText("Banana")).toBeInTheDocument();
  });

  it("hides 'In other databases' but still shows this database's tables when other databases have none", async () => {
    setup({
      tables: [
        libraryTable({ id: 1, name: "Orders", database_id: TARGET_DB_ID }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.queryByText("In other databases")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("library-tables-other-databases"),
    ).not.toBeInTheDocument();

    const currentDatabase = within(
      screen.getByTestId("library-tables-current-database"),
    );
    expect(screen.getByText("In this database")).toBeInTheDocument();
    expect(currentDatabase.getByText("Orders")).toBeInTheDocument();
    // No empty message when there are tables to show
    expect(currentDatabase.queryByText("No tables")).not.toBeInTheDocument();
  });

  it("shows the database name only for tables in other databases", async () => {
    setup({
      tables: [
        libraryTable({
          id: 1,
          name: "Local table",
          database_id: TARGET_DB_ID,
          database_name: "Analytics DB",
        }),
        libraryTable({
          id: 2,
          name: "Remote table",
          database_id: 2,
          database_name: "Sales DB",
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const currentDatabase = within(
      screen.getByTestId("library-tables-current-database"),
    );
    expect(currentDatabase.getByText("Local table")).toBeInTheDocument();
    // The current database's own name is not repeated on its tables
    expect(currentDatabase.queryByText("Analytics DB")).not.toBeInTheDocument();

    const otherDatabases = within(
      screen.getByTestId("library-tables-other-databases"),
    );
    expect(otherDatabases.getByText("Remote table")).toBeInTheDocument();
    expect(otherDatabases.getByText("Sales DB")).toBeInTheDocument();
  });

  it("renders a single 'Tables' list with no database names when there is no query database", async () => {
    setup({
      queryDatabaseId: undefined,
      tables: [
        libraryTable({
          id: 1,
          name: "Apple",
          database_id: 2,
          database_name: "Sales DB",
        }),
        libraryTable({
          id: 2,
          name: "Banana",
          database_id: 3,
          database_name: "Marketing DB",
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(
      screen.queryByTestId("library-tables-current-database"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("library-tables-other-databases"),
    ).not.toBeInTheDocument();

    const tables = within(screen.getByTestId("library-tables"));
    expect(tables.getByText("Apple")).toBeInTheDocument();
    expect(tables.getByText("Banana")).toBeInTheDocument();
    expect(tables.getAllByRole("listitem")).toHaveLength(2);
    // Database names are not shown when there is no split
    expect(tables.queryByText("Sales DB")).not.toBeInTheDocument();
  });

  it("calls onItemClick with the table when a table is clicked", async () => {
    const { onItemClick } = setup({
      tables: [
        libraryTable({ id: 42, name: "Orders", database_id: TARGET_DB_ID }),
      ],
    });
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByText("Orders"));

    expect(onItemClick).toHaveBeenCalledWith({ type: "table", id: 42 });
  });

  it("shows an empty state when the library has no published tables", async () => {
    setup({ tables: [] });
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText("No published tables in your library yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("In this database")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const { onClose } = setup({
      tables: [
        libraryTable({ id: 1, name: "Orders", database_id: TARGET_DB_ID }),
      ],
    });
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByLabelText("close icon"));

    expect(onClose).toHaveBeenCalled();
  });
});
