import { getEditorOptions } from "./utils";

describe("getEditorOptions", () => {
  it("disables the sample database in transforms (metabase#78037)", () => {
    expect(getEditorOptions([]).canUseSampleDatabase).toBe(false);
  });
});
