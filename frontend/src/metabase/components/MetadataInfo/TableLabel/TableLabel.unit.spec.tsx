import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TableLabel from "./TableLabel";

interface SetupOpts {
  table: Table;
}

const setup = ({ table }: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: [table],
    }),
  });

  const metadata = getMetadata(state);

  renderWithProviders(
    <TableLabel table={checkNotNull(metadata.table(table.id))} />,
    { storeInitialState: state },
  );
};

describe("TableLabel", () => {
  it("should display the given table's display name", () => {
    setup({ table: createMockTable({ id: 1, display_name: "Foo" }) });
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });
});
