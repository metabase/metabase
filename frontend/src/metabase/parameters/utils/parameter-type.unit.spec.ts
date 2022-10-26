import { isSingleOrMultiSelectable } from "./parameter-type.ts";

describe("isSingleOrMultiSelectable", () => {
  it("is false for parameters with types not included", () => {
    const parameter = { sectionId: "number", subType: "!=" };
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is false for parameters with acceptable types and rejected subTypes", () => {
    const parameter = { sectionId: "string", subType: "ends-with" };
    expect(isSingleOrMultiSelectable(parameter)).toBe(false);
  });

  it("is true for parameters with acceptable types and corresponding subTypes ", () => {
    const parameter = { sectionId: "location", type: "string/=" };
    expect(isSingleOrMultiSelectable(parameter)).toBe(true);
  });
});
