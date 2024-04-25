import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import type { TableId, Table } from "metabase-types/api";
import {
  createMockField,
  createMockForeignKey,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableInfo } from "./TableInfo";

const TABLE_ID = 1;

const TABLE_FK = createMockForeignKey({
  origin: createMockField({
    id: 1,
    table_id: 2,
    table: createMockTable({
      id: 2,
      display_name: "Connected Table",
    }),
  }),
});

const TABLE_FIELD = createMockField({
  table_id: TABLE_ID,
});

const TABLE = createMockTable({
  id: TABLE_ID,
  fks: [TABLE_FK],
  fields: [TABLE_FIELD],
  description: "Description",
});

const TABLE_WITH_FKS = createMockTable({
  id: TABLE_ID,
  fks: [TABLE_FK],
  fields: undefined,
});

const TABLE_WITH_FIELDS = createMockTable({
  id: TABLE_ID,
  fks: undefined,
  fields: [TABLE_FIELD],
});

const TABLE_WITHOUT_DESCRIPTION = createMockTable({
  id: TABLE_ID,
  description: null,
});

interface SetupOpts {
  id: TableId;
  table?: Table;
}

function setup({ id, table }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: table ? [table] : [],
    }),
  });
  const metadata = getMetadata(state);

  const fetchMetadata = jest.fn();
  const fetchForeignKeys = jest.fn();

  renderWithProviders(
    <TableInfo
      tableId={id}
      table={metadata.table(table?.id) ?? undefined}
      fetchMetadata={fetchMetadata}
      fetchForeignKeys={fetchForeignKeys}
    />,
    { storeInitialState: state },
  );

  return { fetchMetadata, fetchForeignKeys };
}

describe("TableInfo", () => {
  it("should fetch table metadata if fields are missing", () => {
    const { fetchMetadata, fetchForeignKeys } = setup({
      id: TABLE_ID,
      table: TABLE_WITH_FKS,
    });
    expect(fetchMetadata).toHaveBeenCalledWith({
      id: TABLE_ID,
    });
    expect(fetchForeignKeys).not.toHaveBeenCalled();
  });

  it("should fetch table metadata if the table is undefined", () => {
    const { fetchMetadata, fetchForeignKeys } = setup({
      id: TABLE_ID,
      table: undefined,
    });

    expect(fetchMetadata).toHaveBeenCalledWith({
      id: TABLE_ID,
    });
    expect(fetchForeignKeys).toHaveBeenCalledWith({
      id: TABLE_ID,
    });
  });

  it("should fetch fks if fks are undefined on table", () => {
    const { fetchMetadata, fetchForeignKeys } = setup({
      id: TABLE_ID,
      table: TABLE_WITH_FIELDS,
    });

    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchForeignKeys).toHaveBeenCalledWith({ id: TABLE_ID });
  });

  it("should not send requests fetching table metadata when metadata is already present", () => {
    const { fetchMetadata, fetchForeignKeys } = setup({
      id: TABLE_ID,
      table: TABLE,
    });

    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchForeignKeys).not.toHaveBeenCalled();
  });

  it("should display a placeholder if table has no description", async () => {
    setup({
      id: TABLE_ID,
      table: TABLE_WITHOUT_DESCRIPTION,
    });

    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  describe("after metadata has been fetched", () => {
    it("should display the given table's description", () => {
      setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText(TABLE.description ?? "")).toBeInTheDocument();
    });

    it("should show a count of columns on the table", () => {
      setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText("1 column")).toBeInTheDocument();
    });

    it("should list connected tables", () => {
      setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText("Connected Table")).toBeInTheDocument();
    });
  });
});
