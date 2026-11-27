import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  columnFinder,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { FieldId, TemplateTag } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockParameter,
  createMockTable,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";

import {
  columnFilterForParameter,
  dimensionTagFilterForParameter,
  variableTagFilterForParameter,
} from "./filters";

const query = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
  query: "SELECT 1",
});

function createDimensionTag(fieldId: FieldId): TemplateTag {
  return createMockTemplateTag({
    name: "tag",
    type: "dimension",
    "field-id": fieldId,
  });
}

describe("parameters/utils/filters", () => {
  describe("dimensionTagFilterForParameter", () => {
    const CASES: [string, string, FieldId][] = [
      ["date/single", "date", ORDERS.CREATED_AT],
      ["id", "id", PRODUCTS.ID],
      ["category", "category", PRODUCTS.CATEGORY],
      ["location/city", "location", PEOPLE.CITY],
      ["number/!=", "number", ORDERS.QUANTITY],
      ["number/between", "coordinate", PEOPLE.LATITUDE],
      ["string/=", "category", PRODUCTS.CATEGORY],
      ["string/starts-with", "string", PRODUCTS.TITLE],
    ];

    it.each(CASES)(
      "should accept %s parameter for %s field",
      (parameterType, _fieldName, fieldId) => {
        const predicate = dimensionTagFilterForParameter(
          query,
          createMockParameter({ type: parameterType }),
        );
        expect(predicate(createDimensionTag(fieldId))).toBe(true);
      },
    );

    it("should reject tag without dimension", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "string/=" }),
      );
      expect(
        predicate(createMockTemplateTag({ name: "tag", type: "dimension" })),
      ).toBe(false);
    });

    it("should reject address field for category parameter", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "category" }),
      );
      expect(predicate(createDimensionTag(PEOPLE.ADDRESS))).toBe(false);
    });

    it("should reject number field for date parameter", () => {
      const predicate = dimensionTagFilterForParameter(
        query,
        createMockParameter({ type: "date/single" }),
      );
      expect(predicate(createDimensionTag(ORDERS.QUANTITY))).toBe(false);
    });
  });

  describe("columnFilterForParameter", () => {
    // Like the Postgres `ip_addresses` test table: an inet column and a text
    // `count` column marked as a quantity
    const DATABASE_ID = 2;
    const TABLE_ID = 20;
    const DATABASE = createMockDatabase({
      id: DATABASE_ID,
      tables: [
        createMockTable({
          id: TABLE_ID,
          db_id: DATABASE_ID,
          name: "ip_addresses",
          display_name: "IP Addresses",
          fields: [
            createMockField({
              id: 201,
              table_id: TABLE_ID,
              name: "inet",
              display_name: "Inet",
              base_type: "type/IPAddress",
              effective_type: "type/IPAddress",
              semantic_type: null,
            }),
            createMockField({
              id: 202,
              table_id: TABLE_ID,
              name: "count",
              display_name: "Count",
              base_type: "type/Text",
              effective_type: "type/Text",
              semantic_type: "type/Quantity",
            }),
            createMockField({
              id: 203,
              table_id: TABLE_ID,
              name: "created_at",
              display_name: "Created At",
              base_type: "type/DateTime",
              effective_type: "type/DateTime",
              semantic_type: null,
            }),
          ],
        }),
      ],
    });
    const provider = createMetadataProvider({
      databaseId: DATABASE_ID,
      metadata: createMockMetadata({ databases: [DATABASE] }),
    });
    const tableQuery = Lib.createTestQuery(provider, {
      stages: [{ source: { type: "table", id: TABLE_ID } }],
    });
    const findColumn = columnFinder(
      tableQuery,
      Lib.filterableColumns(tableQuery, 0),
    );

    it.each(["inet", "count"])(
      "should offer the %s column for a 'Text or Category' filter",
      (columnName) => {
        const predicate = columnFilterForParameter(
          tableQuery,
          0,
          createMockParameter({ type: "string/=", sectionId: "string" }),
        );
        expect(predicate(findColumn("ip_addresses", columnName))).toBe(true);
      },
    );

    it("should not offer a date column for a 'Text or Category' filter", () => {
      const predicate = columnFilterForParameter(
        tableQuery,
        0,
        createMockParameter({ type: "string/=", sectionId: "string" }),
      );
      expect(predicate(findColumn("ip_addresses", "created_at"))).toBe(false);
    });
  });

  describe("variableTagFilterForParameter", () => {
    it("should match number tag with number parameter", () => {
      const predicate = variableTagFilterForParameter(
        createMockParameter({ type: "number/=" }),
      );
      expect(predicate(createMockTemplateTag({ type: "number" }))).toBe(true);
      expect(predicate(createMockTemplateTag({ type: "text" }))).toBe(false);
    });
  });
});
