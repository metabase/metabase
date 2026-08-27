import { TYPE } from "metabase-lib/v1/types/constants";
import { createMockColumn } from "metabase-types/api/mocks";

import { formatValue } from "./value";

// Pure engine behaviour only (direct formatValue return values, no rendering).
// The jsx + rich rendering paths (links, images, email components, and the
// collapse-newlines behaviour that runs through them) are tested in
// visualizations/lib/register-jsx-formatting.unit.spec.tsx.
describe("formatValue", () => {
  describe("collapseNewlines", () => {
    it("should collapse newlines in plain text when collapseNewlines is true", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should preserve newlines when collapseNewlines is false", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        collapseNewlines: false,
        jsx: false,
      });
      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should preserve newlines when collapseNewlines is not specified", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        jsx: false,
      });
      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should handle null values with collapseNewlines", () => {
      const result = formatValue(null, {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe(null);
    });

    it("should handle numbers with collapseNewlines", () => {
      const result = formatValue(123.45, {
        collapseNewlines: true,
        jsx: false,
        column: createMockColumn({ base_type: "type/Float" }),
      });
      expect(result).toBe("123.45");
    });

    it("should collapse multiple consecutive newlines", () => {
      const result = formatValue("Line 1\n\n\nLine 2", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1   Line 2");
    });

    it("should collapse Windows CRLF newlines", () => {
      const result = formatValue("Line 1\r\nLine 2\r\nLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should collapse old Mac CR newlines", () => {
      const result = formatValue("Line 1\rLine 2\rLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should collapse mixed newline types", () => {
      const result = formatValue("Line 1\nLine 2\r\nLine 3\rLine 4", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3 Line 4");
    });

    it("should collapse Unicode line separators", () => {
      const result = formatValue("Line 1\u2028Line 2\u2029Line 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });
  });

  it("should return null on nullish values by default", () => {
    expect(formatValue(null)).toEqual(null);
    expect(formatValue(undefined)).toEqual(null);
  });

  it("should format null as (empty) when stringifyNull option is true", () => {
    expect(formatValue(null, { stringifyNull: true })).toEqual("(empty)");
    expect(formatValue(undefined, { stringifyNull: true })).toEqual("(empty)");
  });

  it("should format numbers with null column", () => {
    expect(formatValue(12345)).toEqual("12345");
  });

  it("should format numbers with commas", () => {
    expect(
      formatValue(12345, {
        column: { base_type: TYPE.Number, semantic_type: TYPE.Number },
      }),
    ).toEqual("12,345");
  });

  it("should format big integers", () => {
    const options = {
      column: { base_type: TYPE.Number, semantic_type: TYPE.Number },
    };

    expect(formatValue(9223372036854775807n, options)).toEqual(
      "9,223,372,036,854,775,807",
    );
    expect(formatValue("9223372036854775807", options)).toEqual(
      "9,223,372,036,854,775,807",
    );
  });

  it("should format zip codes without commas", () => {
    expect(
      formatValue(12345, {
        column: { base_type: TYPE.Number, semantic_type: TYPE.ZipCode },
      }),
    ).toEqual("12345");
  });

  it("should format latitude and longitude columns correctly", () => {
    expect(
      formatValue(37.7749, {
        column: { base_type: TYPE.Number, semantic_type: TYPE.Latitude },
      }),
    ).toEqual("37.77490000° N");
    expect(
      formatValue(-122.4194, {
        column: { base_type: TYPE.Number, semantic_type: TYPE.Longitude },
      }),
    ).toEqual("122.41940000° W");
  });

  it("should not add mailto prefix if there's a different semantic type", () => {
    expect(
      formatValue("foobar@example.test", {
        jsx: true,
        rich: true,
        column: { semantic_type: "type/PK" },
      }),
    ).toEqual("foobar@example.test");
  });

  it("should display hour-of-day with 12 hour clock", () => {
    expect(
      formatValue(24, {
        date_style: null,
        time_enabled: "minutes",
        time_style: "h:mm A",
        column: {
          base_type: "type/DateTime",
          unit: "hour-of-day",
        },
      }),
    ).toEqual("12:00 AM");
  });

  it("should display hour-of-day with 24 hour clock", () => {
    expect(
      formatValue(24, {
        date_style: null,
        time_enabled: "minutes",
        time_style: "HH:mm",
        column: {
          base_type: "type/DateTime",
          unit: "hour-of-day",
        },
      }),
    ).toEqual("00:00");
  });

  it("should not include time for type/Date type (metabase#7494)", () => {
    expect(
      formatValue("2019-07-07T00:00:00.000Z", {
        date_style: "M/D/YYYY",
        time_enabled: "minutes",
        time_style: "HH:mm",
        column: {
          base_type: "type/Date",
          unit: "hour-of-day",
        },
      }),
    ).toEqual("7/7/2019");
  });
});
