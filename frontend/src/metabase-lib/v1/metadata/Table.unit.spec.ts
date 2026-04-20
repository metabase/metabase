import { createMockMetadata } from "__support__/metadata";
import {
  createMockField,
  createMockForeignKey,
  createMockTable,
} from "metabase-types/api/mocks";

const TABLE_ORIGIN_ID = 1;
const TABLE_DESTINATION_ID = 2;
const TABLE_EMPTY_ID = 3;
const TABLE_VIRTUAL_ID = "card__1";
const FIELD_ORIGIN_ID = 1;
const FIELD_DESTINATION_ID = 2;

const FIELD_ORIGIN = createMockField({
  id: FIELD_ORIGIN_ID,
  table_id: TABLE_ORIGIN_ID,
});

const FIELD_DESTINATION = createMockField({
  id: FIELD_DESTINATION_ID,
  table_id: TABLE_DESTINATION_ID,
});

const TABLE_ORIGIN = createMockTable({
  id: TABLE_ORIGIN_ID,
  fields: [FIELD_ORIGIN],
});

const TABLE_DESTINATION = createMockTable({
  id: TABLE_DESTINATION_ID,
  fields: [FIELD_DESTINATION],
  fks: [
    createMockForeignKey({
      origin: FIELD_ORIGIN,
      origin_id: FIELD_ORIGIN_ID,
      destination: FIELD_DESTINATION,
      destination_id: FIELD_DESTINATION_ID,
    }),
  ],
});

const TABLE_EMPTY = createMockTable({
  id: TABLE_EMPTY_ID,
});

const TABLE_VIRTUAL = createMockTable({
  id: TABLE_VIRTUAL_ID,
});

const setup = () => {
  return createMockMetadata({
    tables: [TABLE_ORIGIN, TABLE_DESTINATION, TABLE_EMPTY, TABLE_VIRTUAL],
  });
};

describe("Table", () => {
  describe("numFields", () => {
    it("should return the number of fields", () => {
      const metadata = setup();
      const table = metadata.table(TABLE_ORIGIN_ID);

      expect(table?.numFields()).toBe(TABLE_ORIGIN.fields?.length);
    });

    it("should handle scenario where fields prop is missing", () => {
      const metadata = setup();
      const table = metadata.table(TABLE_EMPTY_ID);

      expect(table?.numFields()).toBe(0);
    });
  });

  describe("connectedTables", () => {
    it("should return a list of table instances connected to it via fk", () => {
      const metadata = setup();
      const originTable = metadata.table(TABLE_ORIGIN_ID);
      const destinationTable = metadata.table(TABLE_DESTINATION_ID);

      expect(destinationTable?.connectedTables()).toEqual([originTable]);
    });
  });

  describe("question() with settings.default_row_limit", () => {
    const getLimit = (metadata: ReturnType<typeof setup>, tableId: number) => {
      const q = metadata.table(tableId)?.question();
      const dq = q?.datasetQuery() as { query?: { limit?: number } };
      return dq?.query?.limit;
    };

    it("seeds MBQL :limit when settings.default_row_limit is set", () => {
      const TABLE_WITH_LIMIT = createMockTable({
        id: 99,
        settings: { default_row_limit: 250 },
      });
      const metadata = createMockMetadata({ tables: [TABLE_WITH_LIMIT] });

      expect(getLimit(metadata, 99)).toBe(250);
    });

    it("does not add :limit when settings is absent", () => {
      const metadata = setup();
      expect(getLimit(metadata, TABLE_ORIGIN_ID)).toBeUndefined();
    });

    it("ignores non-positive values", () => {
      const TABLE_BAD_LIMIT = createMockTable({
        id: 100,
        settings: { default_row_limit: 0 },
      });
      const metadata = createMockMetadata({ tables: [TABLE_BAD_LIMIT] });
      expect(getLimit(metadata, 100)).toBeUndefined();
    });

    it("ignores null default_row_limit", () => {
      const TABLE_NULL_LIMIT = createMockTable({
        id: 101,
        settings: { default_row_limit: null },
      });
      const metadata = createMockMetadata({ tables: [TABLE_NULL_LIMIT] });
      expect(getLimit(metadata, 101)).toBeUndefined();
    });

    it("ignores settings that is null (no blob at all)", () => {
      const TABLE_NO_SETTINGS = createMockTable({
        id: 102,
        settings: null,
      });
      const metadata = createMockMetadata({ tables: [TABLE_NO_SETTINGS] });
      expect(getLimit(metadata, 102)).toBeUndefined();
    });
  });
});
