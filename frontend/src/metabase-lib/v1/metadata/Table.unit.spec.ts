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

  describe("isVirtualCard", () => {
    it("should return false when the Table is not a virtual card table", () => {
      const metadata = setup();
      const table = metadata.table(TABLE_ORIGIN_ID);
      expect(table?.isVirtualCard()).toBe(false);
    });

    it("should return true when the Table is a virtual card table", () => {
      const metadata = setup();
      const table = metadata.table(TABLE_VIRTUAL_ID);
      expect(table?.isVirtualCard()).toBe(true);
    });
  });
});
