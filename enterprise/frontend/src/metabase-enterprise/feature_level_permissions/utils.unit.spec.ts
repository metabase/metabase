import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { getDataColumns } from "./utils";

describe("getDataColumns", () => {
  const originalIsEnabled = PLUGIN_TRANSFORMS.isEnabled;

  afterEach(() => {
    PLUGIN_TRANSFORMS.isEnabled = originalIsEnabled;
  });

  describe("schemas subject (database level)", () => {
    it("returns 4 columns with Transforms when PLUGIN_TRANSFORMS.isEnabled is true", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      expect(getDataColumns("schemas", "admin")).toStrictEqual([
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
        { name: "Manage database" },
        { name: "Transforms", hint: null },
      ]);
    });

    it("returns 3 columns without Transforms when PLUGIN_TRANSFORMS.isEnabled is false", () => {
      PLUGIN_TRANSFORMS.isEnabled = false;

      expect(getDataColumns("schemas")).toStrictEqual([
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
        { name: "Manage database" },
      ]);
    });
  });

  describe("tables subject (schema level)", () => {
    it("returns 2 columns without Transforms regardless of PLUGIN_TRANSFORMS.isEnabled", () => {
      const expectedColumns = [
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
      ];

      PLUGIN_TRANSFORMS.isEnabled = true;
      expect(getDataColumns("tables")).toStrictEqual(expectedColumns);

      PLUGIN_TRANSFORMS.isEnabled = false;
      expect(getDataColumns("tables")).toStrictEqual(expectedColumns);
    });
  });

  describe("fields subject (table level)", () => {
    it("returns 2 columns without Transforms regardless of PLUGIN_TRANSFORMS.isEnabled", () => {
      const expectedColumns = [
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
      ];

      PLUGIN_TRANSFORMS.isEnabled = true;
      expect(getDataColumns("fields")).toStrictEqual(expectedColumns);

      PLUGIN_TRANSFORMS.isEnabled = false;
      expect(getDataColumns("fields")).toStrictEqual(expectedColumns);
    });
  });
});
