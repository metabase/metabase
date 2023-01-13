import { createMockField } from "metabase-types/api/mocks";
import Field from "metabase-lib/metadata/Field";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import { canListParameterValues } from "./parameter-source";

describe("canListParameterValues", () => {
  it("should list with fields source", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            has_field_values: "list",
          }),
        ),
      ],
      values_query_type: "list",
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with card source", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            has_field_values: "none",
          }),
        ),
      ],
      values_query_type: "list",
      values_source_type: "card",
      values_source_config: {
        card_id: 1,
        value_field: ["field", 1, null],
      },
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });

  it("should list with static list source", () => {
    const parameter = createMockUiParameter({
      fields: [
        new Field(
          createMockField({
            has_field_values: "none",
          }),
        ),
      ],
      values_query_type: "list",
      values_source_type: "static-list",
      values_source_config: {
        values: ["A", "B"],
      },
    });

    expect(canListParameterValues(parameter)).toBeTruthy();
  });
});
