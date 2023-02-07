import { getChangedValues, formatValue } from "./utils";

describe("actions > containers > ActionParametersInputForm > utils", () => {
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

  describe("getChangedValues", () => {
    it("should flag changed fields from null to a value", () => {
      const oldValues = {
        "abc-def": null,
      };

      const newValues = {
        "abc-def": "abc",
      };

      const result = getChangedValues(newValues, oldValues);

      expect(result).toEqual(newValues);
    });

    it("should flag changed fields from undefined to a value", () => {
      const oldValues = {
        "abc-def": undefined,
      };

      const newValues = {
        "abc-def": "abc",
      };

      const result = getChangedValues(newValues, oldValues);

      expect(result).toEqual(newValues);
    });

    it("should flag fields changed from null to empty string", () => {
      const oldValues = {
        "abc-def": null,
      };

      const newValues = {
        "abc-def": "",
      };

      const result = getChangedValues(newValues, oldValues);

      expect(result).toEqual({ "abc-def": "" });
    });
  });
});
