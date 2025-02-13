import { screen, within } from "@testing-library/react";
import { Route } from "react-router";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TableList from "./TableList";

const databaseId = getNextId();

const disabledStyle = "pointer-events: none; opacity: 0.4;";

const incompleteTable = createMockTable({
  id: getNextId(),
  db_id: databaseId,
  display_name: "Incomplete table",
  initial_sync_status: "incomplete",
});

const abortedTable = createMockTable({
  id: getNextId(),
  db_id: databaseId,
  display_name: "Aborted table",
  initial_sync_status: "aborted",
});

const completeTable = createMockTable({
  id: getNextId(),
  db_id: databaseId,
  display_name: "Complete table",
  initial_sync_status: "complete",
});

const tables = [incompleteTable, abortedTable, completeTable];

const database = createMockDatabase({
  id: databaseId,
  name: "Test Database",
  tables,
});

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
  }),
});

function setup() {
  return renderWithProviders(
    <Route
      path="/"
      component={() => <TableList params={{ databaseId }} style={{}} />}
    />,
    { storeInitialState, withRouter: true },
  );
}

describe("TableList", () => {
  it("should render all tables", () => {
    setup();

    expect(screen.getByText(incompleteTable.display_name)).toBeInTheDocument();
    expect(screen.getByText(abortedTable.display_name)).toBeInTheDocument();
    expect(screen.getByText(completeTable.display_name)).toBeInTheDocument();
  });

  it("should show tables with initial_sync_status='incomplete' as non-interactive (disabled)", () => {
    setup();

    const table = incompleteTable;

    const tableIndex = tables.indexOf(table);
    const tableItem = screen.getAllByTestId("table-list-item")[tableIndex];
    const link = within(tableItem).queryByRole("link");

    expect(tableItem).toHaveStyle(disabledStyle);
    expect(link).not.toBeInTheDocument();
  });

  it("should show tables with initial_sync_status='aborted' as non-interactive (disabled)", () => {
    setup();

    const table = abortedTable;

    const tableIndex = tables.indexOf(table);
    const tableItem = screen.getAllByTestId("table-list-item")[tableIndex];
    const link = within(tableItem).queryByRole("link");

    expect(tableItem).toHaveStyle(disabledStyle);
    expect(link).not.toBeInTheDocument();
  });

  it("should show tables with initial_sync_status='complete' as interactive", () => {
    setup();

    const table = completeTable;

    const tableIndex = tables.indexOf(table);
    const tableItem = screen.getAllByTestId("table-list-item")[tableIndex];
    const link = within(tableItem).queryByRole("link");

    expect(tableItem).not.toHaveStyle(disabledStyle);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      `/reference/databases/${databaseId}/tables/${table.id}`,
    );
  });
});
