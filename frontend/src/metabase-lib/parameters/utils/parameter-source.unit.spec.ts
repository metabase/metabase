import { createMockField } from "metabase-types/api/mocks";
import Field from "metabase-lib/metadata/Field";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import { canListParameterValues } from "./parameter-source";

describe("canListParameterValues", () => {
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
