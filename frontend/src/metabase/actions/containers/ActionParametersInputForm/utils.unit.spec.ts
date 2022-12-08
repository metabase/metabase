import type { FieldSettingsMap } from "metabase-types/api";
import {
  setDefaultValues,
  getChangedValues,
  setNumericValues,
  formatValue,
} from "./utils";

describe("actions > containers > ActionParametersInputForm > utils", () => {
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

  describe("formatValue", () => {
    it("ignores null values", () => {
      const result = formatValue(null);
      expect(result).toEqual(null);
    });

    it("ignores numeric values", () => {
      const result = formatValue(123);
      expect(result).toEqual(123);
    });

    it("ignores string values", () => {
      const result = formatValue("123");
      expect(result).toEqual("123");
    });

    it("formats dates", () => {
      const result = formatValue("2020-05-01T00:00:00Z", "date");
      expect(result).toEqual("2020-05-01");
    });

    it("formats datetimes", () => {
      const result = formatValue("2020-05-01T05:00:00Z", "datetime");
      expect(result).toEqual("2020-05-01T05:00:00");
    });
  });

  describe("setNumericValues", () => {
    it("should set a numeric value for a numeric form field", () => {
      const params = {
        "abc-def": "123",
      };

      const fieldSettings = {
        "abc-def": {
          fieldType: "number",
        },
      };

      const result = setNumericValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": 123,
      });
    });

    it("should not alter string fields", () => {
      const params = {
        "abc-def": "123",
        "ghi-jkl": "456",
      };

      const fieldSettings = {
        "abc-def": {
          fieldType: "number",
        },
        "ghi-jkl": {
          fieldType: "string",
        },
      };

      const result = setNumericValues(
        params,
        fieldSettings as unknown as FieldSettingsMap,
      );

      expect(result).toEqual({
        "abc-def": 123,
        "ghi-jkl": "456",
      });
    });
  });

  describe("getChangedValues", () => {
    it("should flag changed fields", () => {
      const oldValues = {
        "abc-def": null,
      };

      const newValues = {
        "abc-def": "abc",
      };

      const result = getChangedValues(newValues, oldValues);

      expect(result).toEqual(newValues);
    });

    it("should not flag fields changed from null to empty string", () => {
      const oldValues = {
        "abc-def": null,
      };

      const newValues = {
        "abc-def": "",
      };

      const result = getChangedValues(newValues, oldValues);

      expect(result).toEqual({});
    });
  });
});
