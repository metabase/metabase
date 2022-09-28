import type { FieldSettingsMap } from "metabase-types/api";
import { setDefaultValues } from "./utils";

describe("writeback > containers > ActionParametersInputForm > utils", () => {
  describe("setDefaultValues", () => {
    it("should set a default value for a non-required empty form field", () => {
      const params = {
        "abc-def": "",
      };

      const fieldSettings = {
        "abc-def": {
          required: false,
          defaultValue: "bar",
        },
      };

      const result = setDefaultValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": "bar",
      });
    });

    it("should not set a default value for a required empty form field", () => {
      const params = {
        "abc-def": "foo",
        "ghi-jkl": "",
      };

      const fieldSettings = {
        "abc-def": {
          required: false,
          defaultValue: "bar",
        },
        "ghi-jkl": {
          required: true,
          defaultValue: "baz",
        },
      };

      const result = setDefaultValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": "foo",
        "ghi-jkl": "",
      });
    });

    it("it should not override provided form values with default values", () => {
      const params = {
        "abc-def": "foo",
        "ghi-jkl": "foo2",
      };

      const fieldSettings = {
        "abc-def": {
          required: false,
          defaultValue: "bar",
        },
        "ghi-jkl": {
          required: false,
          defaultValue: "baz",
        },
      };

      const result = setDefaultValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": "foo",
        "ghi-jkl": "foo2",
      });
    });

    it("should set multiple default values for multiple non-required empty form fields", () => {
      const params = {
        "abc-def": "",
        "ghi-jkl": "",
      };

      const fieldSettings = {
        "abc-def": {
          required: false,
          defaultValue: "bar",
        },
        "ghi-jkl": {
          required: false,
          defaultValue: "baz",
        },
      };

      const result = setDefaultValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": "bar",
        "ghi-jkl": "baz",
      });
    });
  });
});
