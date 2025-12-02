import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import type { RouteParams } from "../../types";

import { TableSection } from "./TableSection";

type SetupOpts = {
  table?: Table;
  params?: RouteParams;
};

function setup({
  table = createMockTable(),
  params = createMockRouteParams(),
}: SetupOpts = {}) {
  const onSyncOptionsClick = jest.fn();

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <TableSection
          table={table}
          params={params}
          onSyncOptionsClick={onSyncOptionsClick}
        />
      )}
    />,
    { withRouter: true },
  );

  return { onSyncOptionsClick };
}

function createMockRouteParams(opts?: Partial<RouteParams>): RouteParams {
  return {
    databaseId: "1",
    schemaId: "1:public",
    tableId: "1",
    fieldId: "1",
    ...opts,
  };
}

describe("TableSection", () => {
  it("should render the link to explore this table in the query builder", () => {
    const table = createMockTable();
    setup({ table });

    const tableLink = screen.getByLabelText("Go to this table");
    expect(tableLink).toBeInTheDocument();
    expect(tableLink).toHaveAttribute(
      "href",
      `/question#?db=${table.db_id}&table=${table.id}`,
    );
  });
});
