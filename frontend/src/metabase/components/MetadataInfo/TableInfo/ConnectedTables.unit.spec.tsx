import { checkNotNull } from "metabase/core/utils/types";
import { Table } from "metabase-types/api";
import {
  createMockField,
  createMockForeignKey,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import ConnectedTables from "./ConnectedTables";

const EMPTY_TABLE = createMockTable();

const TABLE_WITH_FKS = createMockTable({
  id: 1,
  fks: [
    createMockForeignKey({
      origin_id: 1,
      origin: createMockField({
        id: 1,
        table_id: 2,
        table: createMockTable({
          id: 2,
          display_name: "Foo",
        }),
      }),
    }),
    createMockForeignKey({
      origin_id: 2,
      origin: createMockField({
        id: 2,
        table_id: 3,
        table: createMockTable({
          id: 3,
          display_name: "Bar",
        }),
      }),
    }),
  ],
});

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

  return renderWithProviders(
    <ConnectedTables table={checkNotNull(metadata.table(table.id))} />,
  );
}

describe("ConnectedTables", () => {
  it("should show nothing when the table has no fks", () => {
    const { container } = setup({ table: EMPTY_TABLE });

    expect(container).toBeEmptyDOMElement();
  });

  it("should show a label for each connected table", () => {
    setup({ table: TABLE_WITH_FKS });

    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });
});
