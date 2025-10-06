import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import ColumnCount from "./ColumnCount";

interface SetupOpts {
  table: Table;
}

function setup({ table }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: [table],
    }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <ColumnCount table={checkNotNull(metadata.table(table.id))} />,
  );
}

describe("ColumnCount", () => {
  it("should show a non-plural label for a table with a single field", () => {
    setup({
      table: createMockTable({
        fields: [createMockField()],
      }),
    });

    expect(screen.getByText("1 column")).toBeInTheDocument();
  });

  it("should show a plural label for a table with multiple fields", () => {
    setup({
      table: createMockTable({
        fields: [createMockField(), createMockField()],
      }),
    });

    expect(screen.getByText("2 columns")).toBeInTheDocument();
  });

  it("should handle a scenario where a table has no fields property", () => {
    setup({ table: createMockTable() });

    expect(screen.getByText("0 columns")).toBeInTheDocument();
  });
});
