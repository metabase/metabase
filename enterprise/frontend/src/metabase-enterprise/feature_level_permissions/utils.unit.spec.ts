import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { getDataColumns } from "./utils";

describe("getDataColumns", () => {
  const originalIsEnabled = PLUGIN_TRANSFORMS.isEnabled;

  afterEach(() => {
    PLUGIN_TRANSFORMS.isEnabled = originalIsEnabled;
  });

  describe("schemas subject (database level)", () => {
    it("returns 4 permissions including transforms when PLUGIN_TRANSFORMS.isEnabled is true and transforms are enabled on the instance", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      expect(
        getDataColumns({
          subject: "schemas",
          groupType: "admin",
          transformsEnabled: true,
        }),
      ).toStrictEqual([
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
        { name: "Manage database" },
        { name: "Transforms", hint: null },
      ]);
    });

    it("returns 3 permissions when the transform token feature is disabled", () => {
      PLUGIN_TRANSFORMS.isEnabled = false;

      expect(getDataColumns({ subject: "schemas" })).toStrictEqual([
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
        { name: "Manage database" },
      ]);
    });

    it("returns 3 permissions when the transform token feature is present, but transforms are disabled", () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      expect(
        getDataColumns({ subject: "schemas", transformsEnabled: false }),
      ).toStrictEqual([
        {
          name: "Download results",
          hint: "Downloads of native queries are only allowed if a group has download permissions for the entire database.",
        },
        { name: "Manage table metadata" },
        { name: "Manage database" },
      ]);
    });

    it("returns 3 permissions when the transform token feature is missing, but transforms are enabled (possible downgrade screnario)", () => {
      PLUGIN_TRANSFORMS.isEnabled = false;

      expect(
        getDataColumns({ subject: "schemas", transformsEnabled: true }),
      ).toStrictEqual([
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
      expect(getDataColumns({ subject: "tables" })).toStrictEqual(
        expectedColumns,
      );

      PLUGIN_TRANSFORMS.isEnabled = false;
      expect(getDataColumns({ subject: "tables" })).toStrictEqual(
        expectedColumns,
      );
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
      expect(getDataColumns({ subject: "fields" })).toStrictEqual(
        expectedColumns,
      );

      PLUGIN_TRANSFORMS.isEnabled = false;
      expect(getDataColumns({ subject: "fields" })).toStrictEqual(
        expectedColumns,
      );
    });
  });
});
