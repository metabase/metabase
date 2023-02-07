import { isSingleOrMultiSelectable } from "./parameter-type";

const requiredParameterAttributes = {
  id: "1",
  name: "Name",
  slug: "slug",
  type: "a type",
};

describe("isSingleOrMultiSelectable", () => {
  it("is false for parameters with types not included", () => {
    const parameter = {
      ...requiredParameterAttributes,
      sectionId: "number",
      subType: "!=",
    };
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is false for parameters with acceptable types and rejected subTypes", () => {
    const parameter = {
      ...requiredParameterAttributes,
      sectionId: "string",
      subType: "ends-with",
    };
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is true for parameters with acceptable types and corresponding subTypes ", () => {
    const parameter = {
      ...requiredParameterAttributes,
      sectionId: "location",
      type: "string/=",
    };
    expect(isSingleOrMultiSelectable(parameter)).toBe(true);
  });

  it("is true for parameters with acceptable types and wildcarded subTypes", () => {
    const parameter = {
      ...requiredParameterAttributes,
      type: "category",
    };
    expect(isSingleOrMultiSelectable(parameter)).toBe(true);
  });
});
