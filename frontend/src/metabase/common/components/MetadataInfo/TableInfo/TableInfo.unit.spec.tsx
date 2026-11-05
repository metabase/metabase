import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Table, TableId } from "metabase-types/api";
import {
  createMockField,
  createMockForeignKey,
  createMockTable,
} from "metabase-types/api/mocks";

import { TableInfo } from "./TableInfo";

const TABLE_ID = 1;

const TABLE_FK = createMockForeignKey({
  origin_id: 1,
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
  id: 10,
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

const QUERY_METADATA_URL = `path:/api/table/${TABLE_ID}/query_metadata`;
const FOREIGN_KEYS_URL = `path:/api/table/${TABLE_ID}/fks`;

async function setup({ id, table }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: table ? [table] : [],
    }),
  });
  fetchMock.get(QUERY_METADATA_URL, TABLE);
  fetchMock.get(FOREIGN_KEYS_URL, [TABLE_FK]);

  renderWithProviders(<TableInfo tableId={id} />, {
    storeInitialState: state,
  });

  // The loader fades out once every missing piece has loaded.
  await waitFor(() => expect(screen.getByText("1 column")).toBeVisible());

  return {
    hasFetchedMetadata: () => fetchMock.callHistory.called(QUERY_METADATA_URL),
    hasFetchedForeignKeys: () => fetchMock.callHistory.called(FOREIGN_KEYS_URL),
  };
}

describe("TableInfo", () => {
  it("should fetch table metadata if fields are missing", async () => {
    const { hasFetchedMetadata, hasFetchedForeignKeys } = await setup({
      id: TABLE_ID,
      table: TABLE_WITH_FKS,
    });

    expect(hasFetchedMetadata()).toBe(true);
    expect(hasFetchedForeignKeys()).toBe(false);
  });

  it("should fetch table metadata if the table is undefined", async () => {
    const { hasFetchedMetadata, hasFetchedForeignKeys } = await setup({
      id: TABLE_ID,
      table: undefined,
    });

    expect(hasFetchedMetadata()).toBe(true);
    expect(hasFetchedForeignKeys()).toBe(true);
  });

  it("should fetch fks if fks are undefined on table", async () => {
    const { hasFetchedMetadata, hasFetchedForeignKeys } = await setup({
      id: TABLE_ID,
      table: TABLE_WITH_FIELDS,
    });

    expect(hasFetchedMetadata()).toBe(false);
    expect(hasFetchedForeignKeys()).toBe(true);
  });

  it("should not send requests fetching table metadata when metadata is already present", async () => {
    const { hasFetchedMetadata, hasFetchedForeignKeys } = await setup({
      id: TABLE_ID,
      table: TABLE,
    });

    expect(hasFetchedMetadata()).toBe(false);
    expect(hasFetchedForeignKeys()).toBe(false);
  });

  it("should display a placeholder if table has no description", async () => {
    fetchMock.get(QUERY_METADATA_URL, TABLE_WITHOUT_DESCRIPTION);
    fetchMock.get(FOREIGN_KEYS_URL, []);
    renderWithProviders(<TableInfo tableId={TABLE_ID} />, {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          tables: [TABLE_WITHOUT_DESCRIPTION],
        }),
      }),
    });

    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  describe("after metadata has been fetched", () => {
    it("should display the given table's description", async () => {
      await setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText(TABLE.description ?? "")).toBeInTheDocument();
    });

    it("should show a count of columns on the table", async () => {
      await setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText("1 column")).toBeInTheDocument();
    });

    it("should list connected tables", async () => {
      await setup({ id: TABLE_ID, table: TABLE });
      expect(screen.getByText("Connected Table")).toBeInTheDocument();
    });
  });
});
