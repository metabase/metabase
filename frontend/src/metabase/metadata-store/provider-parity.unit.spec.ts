import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import * as Lib from "metabase-lib";
import {
  createMockCard,
  createMockField,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getMetadata } from "./selectors";

const CARD_ID = 7;
const VIRTUAL_TABLE_ID = `card__${CARD_ID}`;

/**
 * The store's records under the keys `metabase.lib.js.metadata/parse-metadata`
 * reads, without the hydration `getMetadata` performs. Building the provider
 * from this is the shortcut these tests rule out.
 */
function rawRecords(state: ReturnType<typeof createMockState>): Lib.Metadata {
  const { entities } = state;
  // The cast is the point of these tests: the records carry the keys the
  // provider reads, so they pass for a `Metadata` object at the type level,
  // and the tests below show where that falls apart at runtime.
  return {
    databases: entities.databases,
    tables: entities.tables,
    fields: entities.fields,
    questions: entities.questions,
    snippets: entities.snippets,
    measures: entities.measures,
    metrics: entities.metrics,
    segments: entities.segments,
  } as unknown as Lib.Metadata;
}

function columnNames(provider: Lib.MetadataProvider, tableId: string | number) {
  const table = Lib.tableOrCardMetadata(provider, tableId);
  if (!table) {
    return null;
  }
  const query = Lib.queryFromTableOrCardMetadata(provider, table);
  return Lib.visibleColumns(query, -1).map(
    (column) => Lib.displayInfo(query, -1, column).name,
  );
}

describe("the metadata provider's input", () => {
  // A saved question whose columns the store learned from the table endpoint,
  // not from the card: `/api/table/card__7/query_metadata` fills the virtual
  // table, while the card itself carries no result metadata.
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [
        createMockCard({
          id: CARD_ID,
          name: "Saved orders",
          dataset_query: createMockStructuredDatasetQuery({
            database: SAMPLE_DB_ID,
            query: { "source-table": ORDERS_ID },
          }),
        }),
      ],
      tables: [
        createMockTable({
          id: VIRTUAL_TABLE_ID,
          db_id: SAMPLE_DB_ID,
          name: "Saved orders",
          fields: [
            createMockField({
              id: 9001,
              table_id: VIRTUAL_TABLE_ID,
              name: "TOTAL",
              display_name: "Total",
            }),
          ],
        }),
      ],
    }),
  });

  it("should take a card's columns from the hydrated virtual table", () => {
    const provider = Lib.metadataProvider(SAMPLE_DB_ID, getMetadata(state));

    expect(columnNames(provider, VIRTUAL_TABLE_ID)).toEqual(["TOTAL"]);
  });

  it("should not resolve that card from the store's records alone", () => {
    // `assemble-card` reads the virtual table's `fields` and ignores
    // `_plainObject`, because the record holds field ids where the provider
    // needs the fields themselves. Without hydration the card falls through to
    // its source table and reports every Orders column instead.
    const provider = Lib.metadataProvider(SAMPLE_DB_ID, rawRecords(state));

    expect(columnNames(provider, VIRTUAL_TABLE_ID)).not.toEqual(["TOTAL"]);
    expect(columnNames(provider, VIRTUAL_TABLE_ID)?.length).toBeGreaterThan(1);
  });

  it("should resolve a plain table the same either way", () => {
    const hydrated = Lib.metadataProvider(SAMPLE_DB_ID, getMetadata(state));
    const records = Lib.metadataProvider(SAMPLE_DB_ID, rawRecords(state));

    expect(columnNames(records, ORDERS_ID)).toEqual(
      columnNames(hydrated, ORDERS_ID),
    );
  });
});
