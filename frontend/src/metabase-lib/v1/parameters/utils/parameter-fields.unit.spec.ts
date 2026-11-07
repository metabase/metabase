import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import { createMockParameterFieldInfo } from "metabase-types/api/mocks";

import { hasFields } from "./parameter-fields";

describe("parameters/utils/parameter-fields", () => {
  it("`hasFields` should return true if there is at least one field in fields", () => {
    const field = createMockParameterFieldInfo({ id: 1 });
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
