import { isElementOfType } from "react-dom/test-utils";
import moment from "moment";

import {
  formatNumber,
  formatValue,
  formatUrl,
  formatDateTimeWithUnit,
} from "metabase/lib/formatting";
import ExternalLink from "metabase/components/ExternalLink";
import { TYPE } from "metabase/lib/types";

describe("formatting", () => {
  describe("formatNumber", () => {
    it("should format 0 correctly", () => {
      expect(formatNumber(0)).toEqual("0");
    });
    it("should format 1 and -1 correctly", () => {
      expect(formatNumber(1)).toEqual("1");
      expect(formatNumber(-1)).toEqual("-1");
    });
    it("should format large positive and negative numbers correctly", () => {
      expect(formatNumber(10)).toEqual("10");
      expect(formatNumber(99999999)).toEqual("99,999,999");
      expect(formatNumber(-10)).toEqual("-10");
      expect(formatNumber(-99999999)).toEqual("-99,999,999");
    });
    it("should format to 2 significant digits", () => {
      expect(formatNumber(1 / 3)).toEqual("0.33");
      expect(formatNumber(-1 / 3)).toEqual("-0.33");
      expect(formatNumber(0.0001 / 3)).toEqual("0.000033");
    });
    describe("in compact mode", () => {
      it("should format 0 as 0", () => {
        expect(formatNumber(0, { compact: true })).toEqual("0");
      });
      it("shouldn't display small numbers as 0", () => {
        expect(formatNumber(0.1, { compact: true })).toEqual("0.1");
        expect(formatNumber(-0.1, { compact: true })).toEqual("-0.1");
        expect(formatNumber(0.01, { compact: true })).toEqual("0.01");
        expect(formatNumber(-0.01, { compact: true })).toEqual("-0.01");
      });
      it("should round up and down", () => {
        expect(formatNumber(1.01, { compact: true })).toEqual("1.01");
        expect(formatNumber(-1.01, { compact: true })).toEqual("-1.01");
        expect(formatNumber(1.9, { compact: true })).toEqual("1.9");
        expect(formatNumber(-1.9, { compact: true })).toEqual("-1.9");
      });
      it("should format large numbers with metric units", () => {
        expect(formatNumber(1, { compact: true })).toEqual("1");
        expect(formatNumber(1000, { compact: true })).toEqual("1.0k");
        expect(formatNumber(1111, { compact: true })).toEqual("1.1k");
      });
      it("should format percentages", () => {
        const options = { compact: true, number_style: "percent" };
        expect(formatNumber(0, options)).toEqual("0%");
        expect(formatNumber(0.001, options)).toEqual("0.1%");
        expect(formatNumber(0.0001, options)).toEqual("0.01%");
        expect(formatNumber(0.001234, options)).toEqual("0.12%");
        expect(formatNumber(0.1, options)).toEqual("10%");
        expect(formatNumber(0.1234, options)).toEqual("12.34%");
        expect(formatNumber(0.019, options)).toEqual("1.9%");
        expect(formatNumber(0.021, options)).toEqual("2.1%");
        expect(formatNumber(11.11, options)).toEqual("1.1k%");
        expect(formatNumber(-0.22, options)).toEqual("-22%");
      });
      it("should format scientific notation", () => {
        const options = { compact: true, number_style: "scientific" };
        expect(formatNumber(0, options)).toEqual("0.0e+0");
        expect(formatNumber(0.0001, options)).toEqual("1.0e-4");
        expect(formatNumber(0.01, options)).toEqual("1.0e-2");
        expect(formatNumber(0.5, options)).toEqual("5.0e-1");
        expect(formatNumber(123456.78, options)).toEqual("1.2e+5");
        expect(formatNumber(-123456.78, options)).toEqual("-1.2e+5");
      });
      it("should format currency values", () => {
        const options = {
          compact: true,
          number_style: "currency",
          currency: "USD",
        };
        expect(formatNumber(0, options)).toEqual("$0.00");
        expect(formatNumber(0.001, options)).toEqual("$0.00");
        expect(formatNumber(7.24, options)).toEqual("$7.24");
        expect(formatNumber(7.249, options)).toEqual("$7.25");
        expect(formatNumber(724.9, options)).toEqual("$724.90");
        expect(formatNumber(1234.56, options)).toEqual("$1.2k");
        expect(formatNumber(1234567.89, options)).toEqual("$1.2M");
        expect(formatNumber(-1234567.89, options)).toEqual("$-1.2M");
        expect(
          formatNumber(1234567.89, { ...options, currency: "CNY" }),
        ).toEqual("CN¥1.2M");
        expect(
          formatNumber(1234567.89, { ...options, currency_style: "name" }),
        ).toEqual("$1.2M");
      });
    });
    it("should format to correct number of decimal places", () => {
      expect(formatNumber(0.1)).toEqual("0.1");
      expect(formatNumber(0.11)).toEqual("0.11");
      expect(formatNumber(0.111)).toEqual("0.11");
      expect(formatNumber(0.01)).toEqual("0.01");
      expect(formatNumber(0.011)).toEqual("0.011");
      expect(formatNumber(0.0111)).toEqual("0.011");
      expect(formatNumber(1.1)).toEqual("1.1");
      expect(formatNumber(1.11)).toEqual("1.11");
      expect(formatNumber(1.111)).toEqual("1.11");
      expect(formatNumber(111.111)).toEqual("111.11");
    });

    describe("number_style = currency", () => {
      it("should handle positive currency", () => {
        expect(
          formatNumber(1.23, { number_style: "currency", currency: "USD" }),
        ).toBe("$1.23");
      });

      it("should handle negative currency", () => {
        expect(
          formatNumber(-1.23, { number_style: "currency", currency: "USD" }),
        ).toBe("-$1.23");
      });

      describe("with currency_in_header = true and type = cell", () => {
        it("should handle positive currency", () => {
          expect(
            formatNumber(1.23, {
              number_style: "currency",
              currency: "USD",
              currency_in_header: true,
              type: "cell",
            }),
          ).toBe("1.23");
        });

        it("should handle negative currency", () => {
          expect(
            formatNumber(-1.23, {
              number_style: "currency",
              currency: "USD",
              currency_in_header: true,
              type: "cell",
            }),
          ).toBe("-1.23");
        });
      });
    });
  });

  describe("formatValue", () => {
    it("should format numbers with null column", () => {
      expect(formatValue(12345)).toEqual("12345");
    });
    it("should format numbers with commas", () => {
      expect(
        formatValue(12345, {
          column: { base_type: TYPE.Number, special_type: TYPE.Number },
        }),
      ).toEqual("12,345");
    });
    it("should format zip codes without commas", () => {
      expect(
        formatValue(12345, {
          column: { base_type: TYPE.Number, special_type: TYPE.ZipCode },
        }),
      ).toEqual("12345");
    });
    it("should format latitude and longitude columns correctly", () => {
      expect(
        formatValue(37.7749, {
          column: { base_type: TYPE.Number, special_type: TYPE.Latitude },
        }),
      ).toEqual("37.77490000° N");
      expect(
        formatValue(-122.4194, {
          column: { base_type: TYPE.Number, special_type: TYPE.Longitude },
        }),
      ).toEqual("122.41940000° W");
    });
    it("should return a component for links in jsx + rich mode", () => {
      expect(
        isElementOfType(
          formatValue("http://metabase.com/", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
    });
    it("should return a component for email addresses in jsx + rich mode", () => {
      expect(
        isElementOfType(
          formatValue("tom@metabase.com", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
    });
    it("should not add mailto prefix if there's a different special type", () => {
      expect(
        formatValue("foobar@example.com", {
          jsx: true,
          rich: true,
          column: { special_type: "type/PK" },
        }),
      ).toEqual("foobar@example.com");
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
          time_style: "k:mm",
          column: {
            base_type: "type/DateTime",
            unit: "hour-of-day",
          },
        }),
      ).toEqual("24:00");
    });
  });

  describe("formatUrl", () => {
    it("should return a string when not in jsx mode", () => {
      expect(formatUrl("http://metabase.com/")).toEqual("http://metabase.com/");
    });
    it("should return a component for http:, https:, and mailto: links in jsx mode", () => {
      expect(
        isElementOfType(
          formatUrl("http://metabase.com/", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
      expect(
        isElementOfType(
          formatUrl("https://metabase.com/", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
      expect(
        isElementOfType(
          formatUrl("mailto:tom@metabase.com", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
    });
    it("should return a component for custom protocols if the column type is URL", () => {
      expect(
        isElementOfType(
          formatUrl("myproto:some-custom-thing", {
            jsx: true,
            rich: true,
            column: { special_type: TYPE.URL },
          }),
          ExternalLink,
        ),
      ).toEqual(true);
    });
    it("should not return a component for bad urls if the column type is URL", () => {
      expect(
        formatUrl("invalid-blah-blah-blah", {
          jsx: true,
          rich: true,
          column: { special_type: TYPE.URL },
        }),
      ).toEqual("invalid-blah-blah-blah");
    });
    it("should not return a component for custom protocols if the column type isn't URL", () => {
      expect(
        formatUrl("myproto:some-custom-thing", { jsx: true, rich: true }),
      ).toEqual("myproto:some-custom-thing");
    });
    it("should not return a link component for unrecognized links in jsx mode", () => {
      expect(
        isElementOfType(
          formatUrl("metabase.com", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(false);
    });
    it("should return a string for javascript:, data:, and other links in jsx mode", () => {
      expect(
        formatUrl("javascript:alert('pwnd')", { jsx: true, rich: true }),
      ).toEqual("javascript:alert('pwnd')");
      expect(
        formatUrl("data:text/plain;charset=utf-8,hello%20world", {
          jsx: true,
          rich: true,
        }),
      ).toEqual("data:text/plain;charset=utf-8,hello%20world");
    });
    it("should return link component for type/URL and  view_as = link", () => {
      const formatted = formatUrl("http://whatever", {
        jsx: true,
        rich: true,
        column: { special_type: TYPE.URL },
        view_as: "link",
      });
      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
    });

    it("should not crash if column is null", () => {
      expect(
        formatUrl("foobar", {
          jsx: true,
          rich: true,
          column: null,
        }),
      ).toEqual("foobar");
    });
  });

  describe("formatDateTimeWithUnit", () => {
    it("should format week ranges", () => {
      expect(
        formatDateTimeWithUnit("2019-07-07T00:00:00.000Z", "week", {
          type: "cell",
        }),
      ).toEqual("July 7, 2019 – July 13, 2019");
    });

    it("should always format week ranges in en locale", () => {
      try {
        // globally set locale to es
        moment.locale("es");
        expect(
          formatDateTimeWithUnit("2019-07-07T00:00:00.000Z", "week", {
            type: "cell",
          }),
        ).toEqual("julio 7, 2019 – julio 13, 2019");
      } finally {
        // globally reset locale
        moment.locale(false);
      }
    });
  });
});
