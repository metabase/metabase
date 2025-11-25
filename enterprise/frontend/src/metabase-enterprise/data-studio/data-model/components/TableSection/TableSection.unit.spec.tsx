import { Route } from "react-router";

import {
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";

import type { RouteParams } from "../../pages/DataModel/types";

import { TableSection } from "./TableSection";

type SetupOpts = {
  table?: Table;
  params?: RouteParams;
};

function setup({ table = createMockTable() }: SetupOpts = {}) {
  const onSyncOptionsClick = jest.fn();

  setupUsersEndpoints([createMockUser()]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "seen-publish-models-info",
    value: true,
  });

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <TableSection table={table} onSyncOptionsClick={onSyncOptionsClick} />
      )}
    />,
    { withRouter: true },
  );

  return { onSyncOptionsClick };
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
