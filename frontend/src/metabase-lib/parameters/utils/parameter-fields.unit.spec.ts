import { createMockField } from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import type Field from "metabase-lib/metadata/Field";
import { hasFields } from "./parameter-fields";

describe("parameters/utils/parameter-fields", () => {
  it("`hasFields` should return true if there is at least one field in fields", () => {
    const metadata = createMockMetadata({
      fields: [
        createMockField({
          id: 1,
        }),
      ],
    });
    const field = metadata.field(1) as Field;
    const parameterWithFields = createMockUiParameter({
      fields: [field],
    });
    const parameterWithoutFields = createMockUiParameter({
      fields: [],
    });
    const parameterWithoutFieldsKey = createMockUiParameter();
    expect(hasFields(parameterWithFields)).toBe(true);
    expect(hasFields(parameterWithoutFields)).toBe(false);
    expect(hasFields(parameterWithoutFieldsKey)).toBe(false);
  });
});
