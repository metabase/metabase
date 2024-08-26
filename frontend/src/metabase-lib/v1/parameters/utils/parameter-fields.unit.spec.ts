import { createMockMetadata } from "__support__/metadata";
import type Field from "metabase-lib/v1/metadata/Field";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import { createMockField } from "metabase-types/api/mocks";

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
