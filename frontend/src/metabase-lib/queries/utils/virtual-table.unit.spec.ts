import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";

import { createVirtualField, createVirtualTable } from "./virtual-table";

describe("metabase-lib/queries/utils/virtual-table", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const productsTable = metadata.table(PRODUCTS_ID) as Table;

  const query = productsTable.newQuestion().query() as StructuredQuery;
  const field = createVirtualField({
    id: 123,
    metadata,
    query,
  });

  describe("createVirtualField", () => {
    it("should return a new Field instance", () => {
      expect(field.id).toBe(123);
      expect(field).toBeInstanceOf(Field);
    });

    it("should set `metadata` and `query` on the field instance but not its underlying plain object", () => {
      expect(field.metadata).toBe(metadata);
      expect(field.query).toBe(query);

      const plainObject = field.getPlainObject() as any;
      expect(plainObject.metadata).toBeUndefined();
      expect(plainObject.query).toBeUndefined();
    });
  });

  describe("createVirtualTable", () => {
    const query = productsTable.newQuestion().query() as StructuredQuery;
    const field1 = createVirtualField({
      id: 1,
      metadata,
      query,
    });
    const field2 = createVirtualField({
      id: 2,
      metadata,
      query,
    });

    const table = createVirtualTable({
      id: 456,
      metadata,
      fields: [field1, field2],
    });

    it("should return a new Table instance", () => {
      expect(table.id).toBe(456);
      expect(table).toBeInstanceOf(Table);
    });

    it("should set `metadata` on the table instance but not its underlying plain object", () => {
      expect(table.metadata).toBe(metadata);

      const plainObject = table.getPlainObject() as any;
      expect(plainObject.metadata).toBeUndefined();
    });

    it("should add a table reference to its fields", () => {
      expect(table.fields?.every(field => field.table === table)).toBe(true);
      expect(table.fields?.every(field => field.table_id === table.id)).toBe(
        true,
      );
    });
  });
});
