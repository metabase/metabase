import { renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableLabel } from "./TableLabel";

interface SetupOpts {
  table: Table;
}

const setup = ({ table }: SetupOpts) => {
  renderWithProviders(<TableLabel table={table} />);
};

describe("TableLabel", () => {
  it("should display the given table's display name", () => {
    setup({ table: createMockTable({ id: 1, display_name: "Foo" }) });
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });
});
