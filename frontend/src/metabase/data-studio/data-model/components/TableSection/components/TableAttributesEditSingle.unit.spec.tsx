import _ from "underscore";

import {
  setupTableEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTable, createMockUser } from "metabase-types/api/mocks";
import type { Table } from "metabase-types/api";

import { TableAttributesEditSingle } from "./TableAttributesEditSingle";

function setup(table: Table) {
  setupUsersEndpoints([createMockUser()]);
  setupTableEndpoints(table);

  renderWithProviders(
    <TableAttributesEditSingle table={table} onUpdate={_.noop} />,
  );
}

describe("TableAttributesEditSingle", () => {
  it("should not crash and show a placeholder when a transform-sourced table has no transform (metabase#69904)", () => {
    // A table produced by a since-deleted transform: data_source is still
    // "metabase-transform" but the backend now returns transform: null.
    const table = createMockTable({
      data_source: "metabase-transform",
      transform: null,
    });

    setup(table);

    expect(
      screen.getByText("Transform does not exist anymore"),
    ).toBeInTheDocument();
  });
});
