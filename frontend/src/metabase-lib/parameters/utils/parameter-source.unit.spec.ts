import { createMockField } from "metabase-types/api/mocks";
import Field from "metabase-lib/metadata/Field";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import {
  canListParameterValues,
  canSearchParameterValues,
} from "./parameter-source";

describe("canListParameterValues", () => {
  it("should not list when it is disabled", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            id: 1,
            has_field_values: "list",
          }),
        ),
        new Field(
          createMockField({
            id: 2,
            has_field_values: "list",
          }),
        ),
      ],
      values_query_type: "none",
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should list when all fields have field values", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            id: 1,
            has_field_values: "list",
          }),
        ),
        new Field(
          createMockField({
            id: 2,
            has_field_values: "list",
          }),
        ),
      ],
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
      fields: [
        new Field(
          createMockField({
            id: 1,
            has_field_values: "list",
          }),
        ),
        new Field(
          createMockField({
            id: 2,
            has_field_values: "search",
          }),
        ),
      ],
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should list when all fields have field values but the parameter is configured for search", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            id: 1,
            has_field_values: "list",
          }),
        ),
        new Field(
          createMockField({
            id: 2,
            has_field_values: "list",
          }),
        ),
      ],
      values_query_type: "search",
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with a card source", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            has_field_values: "none",
          }),
        ),
      ],
      values_source_type: "card",
      values_source_config: {
        card_id: 1,
        value_field: ["field", 1, null],
      },
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with a static list source", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            has_field_values: "none",
          }),
        ),
      ],
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
      fields: [
        new Field(
          createMockField({
            id: 1,
            has_field_values: "search",
          }),
        ),
        new Field(
          createMockField({
            id: 2,
            has_field_values: "search",
          }),
        ),
      ],
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
});
