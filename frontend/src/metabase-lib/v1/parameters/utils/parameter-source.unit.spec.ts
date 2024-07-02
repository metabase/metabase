import { createMockMetadata } from "__support__/metadata";
import type Field from "metabase-lib/v1/metadata/Field";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import { createMockField } from "metabase-types/api/mocks";

import {
  canListParameterValues,
  canSearchParameterValues,
  getQueryType,
} from "./parameter-source";

const LIST_FIELD_ID = 1;
const LIST_FIELD_2_ID = 2;
const SEARCH_FIELD_ID = 3;
const SEARCH_FIELD_2_ID = 4;
const NO_VALUES_FIELD_ID = 5;

const metadata = createMockMetadata({
  fields: [
    createMockField({ id: LIST_FIELD_ID, has_field_values: "list" }),
    createMockField({ id: LIST_FIELD_2_ID, has_field_values: "list" }),
    createMockField({ id: SEARCH_FIELD_ID, has_field_values: "search" }),
    createMockField({ id: SEARCH_FIELD_2_ID, has_field_values: "search" }),
    createMockField({ id: NO_VALUES_FIELD_ID, has_field_values: "none" }),
  ],
});

const listField = metadata.field(LIST_FIELD_ID) as Field;
const listField2 = metadata.field(LIST_FIELD_2_ID) as Field;
const searchField = metadata.field(SEARCH_FIELD_ID) as Field;
const searchField2 = metadata.field(SEARCH_FIELD_2_ID) as Field;
const noValuesField = metadata.field(NO_VALUES_FIELD_ID) as Field;

describe("getQueryType", () => {
  describe.each(["string", "location"])("parameter type %s", type => {
    it.each([
      ["=", "list"],
      ["!=", "list"],
      ["contains", "none"],
      ["does-not-contain", "none"],
      ["starts-with", "none"],
      ["ends-with", "none"],
    ])(
      "and %s operator should return %s query type by default",
      (operator, queryType) => {
        const parameter = createMockUiParameter({
          type: `${type}/${operator}`,
        });
        expect(getQueryType(parameter)).toBe(queryType);
      },
    );
  });

  describe.each(["number"])("parameter type %s", type => {
    it.each([
      ["=", "list"],
      ["!=", "list"],
      [">", "none"],
      ["<", "none"],
      [">=", "none"],
      ["<=", "none"],
      ["between", "none"],
    ])(
      "and %s operator should return %s query type by default",
      (operator, queryType) => {
        const parameter = createMockUiParameter({
          type: `${type}/${operator}`,
        });
        expect(getQueryType(parameter)).toBe(queryType);
      },
    );
  });

  it('should return "list" query type by default for legacy parameter types', () => {
    const parameter = createMockUiParameter({
      type: "category",
    });
    expect(getQueryType(parameter)).toBe("list");
  });
});

describe("canListParameterValues", () => {
  it("should not list when it is disabled", () => {
    const parameter = createMockUiParameter({
      fields: [listField, listField2],
      values_query_type: "none",
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should list when all fields have field values", () => {
    const parameter = createMockUiParameter({
      fields: [listField, listField2],
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should not list when there are no fields", () => {
    const parameter = createMockUiParameter({
      fields: [],
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should not list when some fields don't have field values", () => {
    const parameter = createMockUiParameter({
      fields: [listField, searchField],
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should list when all fields have field values but the parameter is configured for search", () => {
    const parameter = createMockUiParameter({
      fields: [listField, listField2],
      values_query_type: "search",
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with a card source", () => {
    const parameter = createMockUiParameter({
      fields: [noValuesField],
      values_source_type: "card",
      values_source_config: {
        card_id: 1,
        value_field: ["field", noValuesField.id, null],
      },
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with a static list source", () => {
    const parameter = createMockUiParameter({
      fields: [noValuesField],
      values_source_type: "static-list",
      values_source_config: {
        values: ["A", "B"],
      },
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });
});

describe("canSearchParameterValues", () => {
  it("should search when all fields are configured for search but the parameter for dropdown", () => {
    const parameter = createMockUiParameter({
      fields: [searchField, searchField2],
      values_query_type: "list",
    });

    expect(canSearchParameterValues(parameter)).toBeTruthy();
  });

  it("should search with a card source", () => {
    const parameter = createMockUiParameter({
      values_query_type: "search",
      values_source_type: "card",
      values_source_config: {
        card_id: 1,
        value_field: ["field", 1, null],
      },
    });

    expect(canSearchParameterValues(parameter)).toBeTruthy();
  });

  it("should search with a static list source", () => {
    const parameter = createMockUiParameter({
      values_query_type: "search",
      values_source_type: "static-list",
      values_source_config: {
        values: ["A", "B"],
      },
    });

    expect(canSearchParameterValues(parameter)).toBeTruthy();
  });

  it("should not search with a static list source when the parameter is configured for dropdown", () => {
    const parameter = createMockUiParameter({
      values_query_type: "list",
      values_source_type: "static-list",
      values_source_config: {
        values: ["A", "B"],
      },
    });

    expect(canSearchParameterValues(parameter)).toBeFalsy();
  });

  it.each([
    "=",
    "!=",
    "contains",
    "does-not-contain",
    "starts-with",
    "ends-with",
  ])("should allow to search for %s string operator", operator => {
    const parameter = createMockUiParameter({
      type: `string/${operator}`,
      fields: [searchField],
      values_query_type: "search",
    });

    expect(canSearchParameterValues(parameter)).toBe(true);
  });

  it.each(["=", "!="])(
    "should allow to search for %s numeric operator",
    operator => {
      const parameter = createMockUiParameter({
        type: `number/${operator}`,
        fields: [searchField],
      });

      expect(canSearchParameterValues(parameter)).toBe(true);
    },
  );

  it.each([">", "<", ">=", "<=", "between"])(
    "should not allow to search for %s numeric operator",
    operator => {
      const parameter = createMockUiParameter({
        type: `number/${operator}`,
        fields: [searchField],
      });

      expect(canSearchParameterValues(parameter)).toBe(false);
    },
  );

  it("should allow to search for legacy parameter operators", () => {
    const parameter = createMockUiParameter({
      type: "location/state",
      fields: [searchField],
    });

    expect(canSearchParameterValues(parameter)).toBe(true);
  });
});
