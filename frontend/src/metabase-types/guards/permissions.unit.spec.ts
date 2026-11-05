import { DataPermissionValue } from "metabase-types/api";

import { isDataPermissionValue } from "./permissions";

describe("isDataPermissionValue", () => {
  it("accepts every DataPermissionValue", () => {
    Object.values(DataPermissionValue).forEach((value) => {
      expect(isDataPermissionValue(value)).toBe(true);
    });
  });

  it("rejects other values", () => {
    [undefined, null, "", "segmented", 1, {}, { "": "unrestricted" }].forEach(
      (value) => {
        expect(isDataPermissionValue(value)).toBe(false);
      },
    );
  });
});
