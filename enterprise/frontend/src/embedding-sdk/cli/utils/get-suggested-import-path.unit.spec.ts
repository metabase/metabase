import { getSuggestedImportPath } from "../utils/get-suggested-import-path";

describe("CLI > getSuggestedImportPath", () => {
  it.each([
    ["", "./metabase"],
    [".", "."],
    ["./src/components", "./components"],
  ])("suggests a reasonable import path", (input, suggestion) => {
    expect(getSuggestedImportPath(input)).toBe(suggestion);
  });
});
