import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableInfoIcon } from "./TableInfoIcon";

type SetupOpts = {
  table: Table;
};

function setup({ table }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: [table],
    }),
  });

  return renderWithProviders(<TableInfoIcon table={table} />, {
    storeInitialState: state,
  });
}

describe("TableInfoIcon", () => {
  it("should show the hovercard only on hover", async () => {
    const description = "This a table description";
    const table = createMockTable({ description });
    setup({ table });

    const icon = screen.getByLabelText("More info");

    expect(icon).toBeInTheDocument();
    expect(screen.queryByText(description)).not.toBeInTheDocument();

    fireEvent.mouseEnter(icon);

    expect(screen.getByText(description, { exact: false })).toBeInTheDocument();
  });
});
