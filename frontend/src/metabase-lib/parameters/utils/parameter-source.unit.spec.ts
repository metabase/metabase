import { createMockField } from "metabase-types/api/mocks";
import Field from "metabase-lib/metadata/Field";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import { canListParameterValues } from "./parameter-source";

describe("canListParameterValues", () => {
  it("should not list the query type other than list", () => {
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

  it("should list with the default source when all fields have field values", () => {
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

  it("should not list with the default source when there are no fields", () => {
    const parameter = createMockUiParameter({
      fields: [],
    });

    expect(canListParameterValues(parameter)).toBeFalsy();
  });

  it("should not list with the default source when some fields don't have field values", () => {
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

  it("should list with the card source", () => {
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

  it("should list with the static list source", () => {
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
