import { getChangedValues, formatValue, stripTZInfo } from "./utils";

describe("actions > containers > ActionParametersInputForm > utils", () => {
  describe("stripTZInfo", () => {
    it("should strip timezone info from dateTimes", () => {
      const result = stripTZInfo("2020-05-01T03:30:00-02:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
    });

    it("should strip timezone info from times", () => {
      const result = stripTZInfo("2020-05-01T03:30:00+08:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
    });

    it("should not do anything to strings without time info", () => {
      const result = stripTZInfo("2020-05-01");
      expect(result.format()).toEqual("2020-05-01T00:00:00Z");
    });

    it("should not do anything to strings without timezone info", () => {
      const result = stripTZInfo("2020-05-01T03:30:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
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

    const timezones = ["-02:00", "-07:00", "+01:00", "+09:00"];

    timezones.forEach(offset => {
      describe(`with timezone ${offset}`, () => {
        it("formats dates", () => {
          const result = formatValue(`2020-05-01T00:00:00${offset}`, "date");
          expect(result).toEqual("2020-05-01");
        });

        it("formats datetimes", () => {
          const result = formatValue(
            `2020-05-01T05:00:00${offset}`,
            "datetime",
          );
          expect(result).toEqual("2020-05-01T05:00:00");
        });

        it("formats times", () => {
          const result = formatValue(`05:25:30${offset}`, "time");
          expect(result).toEqual("05:25:30");
        });
      });
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
