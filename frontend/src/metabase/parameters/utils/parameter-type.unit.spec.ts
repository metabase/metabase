import { createMockParameter } from "metabase-types/api/mocks";
import { isSingleOrMultiSelectable } from "./parameter-type";

describe("isSingleOrMultiSelectable", () => {
  it("is false for parameters with types not included", () => {
    const parameter = createMockParameter({
      sectionId: "number",
    });
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is false for parameters with acceptable types and rejected subTypes", () => {
    const parameter = createMockParameter({
      type: "a type",
      sectionId: "string",
    });
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is true for parameters with acceptable types and corresponding subTypes", () => {
    const parameter = createMockParameter({
      type: "string/=",
      sectionId: "location",
    });
    expect(isSingleOrMultiSelectable(parameter)).toBe(true);
  });

  it("is true for parameters with acceptable types and wildcarded subTypes", () => {
    const parameter = createMockParameter({
      type: "category",
    });
    expect(isSingleOrMultiSelectable(parameter)).toBe(true);
  });
});
