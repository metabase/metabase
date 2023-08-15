import { screen } from "@testing-library/react";
import { Route } from "react-router";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TableList from "./TableList";

const databaseId = getNextId();

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

const database = createMockDatabase({
  id: databaseId,
  name: "Test Database",
  tables: [incompleteTable, abortedTable, completeTable],
});

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
    tables: [incompleteTable, abortedTable, completeTable],
  }),
});

const defaultProps = {
  params: { databaseId },
  style: {},
};

function setup({ ...options } = {}) {
  return renderWithProviders(
    <Route
      path="/"
      component={() => <TableList {...defaultProps} {...options} />}
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
});
