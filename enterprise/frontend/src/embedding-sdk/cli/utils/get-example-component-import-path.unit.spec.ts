import { getExampleComponentImportPath } from "./get-example-component-import-path";

describe("CLI > getExampleImportPath", () => {
  it("should return a valid example import path", () => {
    expect(getExampleComponentImportPath()).toBe(
      `<path-to-your-components>/metabase`,
    );

    expect(getExampleComponentImportPath("./src/modules/analytics")).toBe(
      `<path-to-your-components>/analytics`,
    );

    expect(getExampleComponentImportPath("components/metabase")).toBe(
      `<path-to-your-components>/metabase`,
    );
  });
});
