import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { isElementOfType } from "react-dom/test-utils";

import { mockSettings } from "__support__/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import {
  capitalize,
  formatNumber,
  formatValue,
  formatUrl,
  formatDateTimeWithUnit,
  formatTime,
  formatTimeWithUnit,
  slugify,
  getCurrencySymbol,
} from "metabase/lib/formatting";
import { TYPE } from "metabase-lib/v1/types/constants";
import { createMockColumn } from "metabase-types/api/mocks";

const SITE_URL = "http://localhost:3000";

describe("formatting", () => {
  beforeAll(() => {
    mockSettings({ site_url: SITE_URL });
  });

  describe("capitalize", () => {
    it("capitalizes a single word", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("capitalizes only the first char of a string", () => {
      expect(capitalize("hello world")).toBe("Hello world");
    });

    it("converts a string to lowercase by default", () => {
      expect(capitalize("heLLo")).toBe("Hello");
    });

    it("doesn't lowercase the string if option provided", () => {
      expect(capitalize("hellO WoRlD", { lowercase: false })).toBe(
        "HellO WoRlD",
      );
    });

    it("doesn't break on an empty string", () => {
      expect(capitalize("")).toBe("");
      expect(capitalize("", { lowercase: false })).toBe("");
    });
  });

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
    it("should format large numbers correctly with non-default number separator", () => {
      const options = { number_separators: ",." };
      expect(formatNumber(10.1, options)).toEqual("10,1");
      expect(formatNumber(99999999.9, options)).toEqual("99.999.999,9");
      expect(formatNumber(-10.1, options)).toEqual("-10,1");
      expect(formatNumber(-99999999.9, options)).toEqual("-99.999.999,9");
    });
    it("should format to 2 significant digits", () => {
      expect(formatNumber(1 / 3)).toEqual("0.33");
      expect(formatNumber(-1 / 3)).toEqual("-0.33");
      expect(formatNumber(0.0001 / 3)).toEqual("0.000033");
    });
    describe("in enclosing negative mode", () => {
      it("should format -4 as (4)", () => {
        expect(formatNumber(-4, { negativeInParentheses: true })).toEqual(
          "(4)",
        );
      });
      it("should format 7 as 7", () => {
        expect(formatNumber(7, { negativeInParentheses: true })).toEqual("7");
      });
      it("should format 0 as 0", () => {
        expect(formatNumber(0, { negativeInParentheses: true })).toEqual("0");
      });
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
        expect(formatNumber(0.867, { number_style: "percent" })).toEqual(
          "86.7%",
        );
        expect(formatNumber(1.2345, { number_style: "percent" })).toEqual(
          "123.45%",
        );
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
      it("should obey custom separators in scientific notiation", () => {
        const options = {
          compact: true,
          number_style: "scientific",
          number_separators: ",.",
        };
        expect(formatNumber(0, options)).toEqual("0,0e+0");
        expect(formatNumber(0.0001, options)).toEqual("1,0e-4");
        expect(formatNumber(0.01, options)).toEqual("1,0e-2");
        expect(formatNumber(0.5, options)).toEqual("5,0e-1");
        expect(formatNumber(123456.78, options)).toEqual("1,2e+5");
        expect(formatNumber(-123456.78, options)).toEqual("-1,2e+5");
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
        expect(formatNumber(-1234567.89, options)).toEqual("-$1.2M");
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
    it("should return null on nullish values by default", () => {
      expect(formatValue(null)).toEqual(null);
      expect(formatValue(undefined)).toEqual(null);
    });
    it("should format null as (empty) when stringifyNull option is true", () => {
      expect(formatValue(null, { stringifyNull: true })).toEqual("(empty)");
      expect(formatValue(undefined, { stringifyNull: true })).toEqual(
        "(empty)",
      );
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
    it("should return the component for external links in jsx + rich mode", () => {
      expect(
        isElementOfType(
          formatValue("http://metabase.com/", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
    });
    it("should return a component for internal links in jsx + rich mode", () => {
      expect(
        isElementOfType(formatValue(SITE_URL, { jsx: true, rich: true }), Link),
      ).toBe(true);
    });
    it("should return a component for relative links in jsx + rich mode", () => {
      const column = createMockColumn({
        name: "column_name",
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/URL",
      });
      expect(
        isElementOfType(
          formatValue("/question/12", {
            jsx: true,
            rich: true,
            view_as: "link",
            link_url: "{{column_name}}",
            clicked: {
              value: "/question/12",
              column: column,
              data: [{ value: "question/12", col: column }],
            },
          }),
          Link,
        ),
      ).toEqual(true);
    });
    it("should not return an ExternalLink for links in jsx + rich mode if there's click behavior", () => {
      const formatted = formatValue("http://metabase.com/", {
        jsx: true,
        rich: true,
        click_behavior: {
          linkTemplate: "foo",
          linkTextTemplate: "foo",
          linkType: "url",
          type: "link",
        },
        clicked: {},
      });
      // it's not actually a link
      expect(isElementOfType(formatted, ExternalLink)).toEqual(false);
      // expect the text to be in a div (which has link formatting) rather than ExternalLink
      expect(formatted.props["data-testid"]).toEqual("link-formatted-text");
    });
    it("should render image", () => {
      const formatted = formatValue("http://metabase.com/logo.png", {
        jsx: true,
        rich: true,
        view_as: "image",
        column: { semantic_type: "type/ImageURL" },
      });
      expect(formatted.type).toEqual("img");
      expect(formatted.props.src).toEqual("http://metabase.com/logo.png");
    });
    it("should render image with a click behavior in jsx + rich mode (metabase#17161)", () => {
      const formatted = formatValue("http://metabase.com/logo.png", {
        jsx: true,
        rich: true,
        view_as: "image",
        click_behavior: {
          linkTemplate: "foo",
          linkType: "url",
          type: "link",
        },
        clicked: {},
      });
      expect(formatted.type).toEqual("img");
      expect(formatted.props.src).toEqual("http://metabase.com/logo.png");
    });
    it("should return a component for email addresses in jsx + rich mode", () => {
      expect(
        isElementOfType(
          formatValue("tom@metabase.test", { jsx: true, rich: true }),
          ExternalLink,
        ),
      ).toEqual(true);
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
          formatUrl("mailto:tom@metabase.test", { jsx: true, rich: true }),
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
            column: { semantic_type: TYPE.URL },
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
          column: { semantic_type: TYPE.URL },
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

    describe("when view_as = link", () => {
      it("should return link component for type/URL and  view_as = link", () => {
        const formatted = formatUrl("http://whatever", {
          jsx: true,
          rich: true,
          column: { semantic_type: TYPE.URL },
          view_as: "link",
        });
        expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
      });

      it("should return link component using link_url and link_text when specified", () => {
        const formatted = formatUrl("http://not.metabase.com", {
          jsx: true,
          rich: true,
          link_text: "metabase link",
          link_url: "http://metabase.com",
          view_as: "link",
          clicked: {},
        });

        expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
        expect(formatted.props.children).toEqual("metabase link");
        expect(formatted.props.href).toEqual("http://metabase.com");
      });

      it("should return link component using link_text and the value as url when link_url is empty", () => {
        const formatted = formatUrl("http://metabase.com", {
          jsx: true,
          rich: true,
          link_text: "metabase link",
          link_url: "",
          view_as: "link",
          clicked: {},
        });

        expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
        expect(formatted.props.children).toEqual("metabase link");
        expect(formatted.props.href).toEqual("http://metabase.com");
      });

      it("should return link component using link_url and the value as text when link_text is empty", () => {
        const formatted = formatUrl("metabase link", {
          jsx: true,
          rich: true,
          link_text: "",
          link_url: "http://metabase.com",
          view_as: "link",
          clicked: {},
        });

        expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
        expect(formatted.props.children).toEqual("metabase link");
        expect(formatted.props.href).toEqual("http://metabase.com");
      });

      it("should not return an ExternalLink in jsx + rich mode if there's click behavior", () => {
        const formatted = formatValue("http://metabase.com/", {
          jsx: true,
          rich: true,
          click_behavior: {
            linkTemplate: "foo",
            linkTextTemplate: "bar",
            linkType: "url",
            type: "link",
          },
          link_text: "metabase link",
          link_url: "http://metabase.com",
          view_as: "link",
          clicked: {},
        });

        // it is not a link set on the question level
        expect(isElementOfType(formatted, ExternalLink)).toEqual(false);
        // expect the text to be in a div (which has link formatting) rather than ExternalLink
        expect(formatted.props["data-testid"]).toEqual("link-formatted-text");
      });
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

    it("should always format week ranges according to returned data", () => {
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
        moment.locale("en");
      }
    });

    it("should format days of week with default options", () => {
      expect(formatDateTimeWithUnit("mon", "day-of-week")).toEqual("Monday");
    });

    it("should format days of week with compact option", () => {
      const options = {
        compact: true,
      };

      expect(formatDateTimeWithUnit("sun", "day-of-week", options)).toEqual(
        "Sun",
      );
    });

    it("should format days of week with exclude option", () => {
      const options = {
        isExclude: true,
      };

      expect(
        formatDateTimeWithUnit("2022-04-25", "day-of-week", options),
      ).toEqual("Monday");
    });

    it("should format hours of day with exclude option", () => {
      const options = {
        isExclude: true,
      };

      expect(
        formatDateTimeWithUnit(
          "2022-04-27T06:00:00.000Z",
          "hour-of-day",
          options,
        ),
      ).toEqual("6 AM");
    });

    test.each([
      ["minute", "Wed, April 27, 2022, 6:00 AM"],
      ["hour", "Wed, April 27, 2022, 6:00 AM"],
      ["day", "Wed, April 27, 2022"],
      ["week", "Wed, April 27, 2022"],
      ["month", "April 2022"],
      ["year", "2022"],
    ])(
      "should include weekday when date unit is smaller or equal whan a week",
      (unit, formatted) => {
        const dateString = "2022-04-27T06:00:00.000Z";

        expect(
          formatDateTimeWithUnit(dateString, unit, {
            weekday_enabled: true,
          }),
        ).toEqual(formatted);
      },
    );
  });

  describe("formatTime", () => {
    const FORMAT_TIME_TESTS = [
      ["01:02:03.456+07:00", "1:02 AM"],
      ["01:02", "1:02 AM"],
      ["22:29:59.26816+01:00", "10:29 PM"],
      ["22:29:59.412459+01:00", "10:29 PM"],
      ["19:14:42.926221+01:00", "7:14 PM"],
      ["19:14:42.13202+01:00", "7:14 PM"],
      ["13:38:58.987352+01:00", "1:38 PM"],
      ["13:38:58.001001+01:00", "1:38 PM"],
      ["17:01:23+01:00", "5:01 PM"],
    ];

    test.each(FORMAT_TIME_TESTS)(
      `formatTime(%p) to be %p`,
      (value, resultStr) => {
        const result = formatTime(value);
        expect(result).toBe(resultStr);
      },
    );

    it("should use options when formatting times", () => {
      const value = "20:34:56";
      const t12 = formatTime(value, "default", {});
      expect(t12).toBe("8:34 PM");
      const t24 = formatTime(value, "default", {
        time_enabled: "minutes",
        time_style: "HH:mm",
      });
      expect(t24).toBe("20:34");
    });
  });

  describe("formatTimeWithUnit", () => {
    it("should format hour-of day with default options", () => {
      expect(formatTimeWithUnit(8, "hour-of-day")).toEqual("8:00 AM");
    });

    it("should format hour-of-day with 12 hour clock", () => {
      const options = {
        time_style: "h:mm A",
      };

      expect(formatTimeWithUnit(14, "hour-of-day", options)).toEqual("2:00 PM");
    });

    it("should format hour-of-day with 24 hour clock", () => {
      const options = {
        time_style: "HH:mm",
      };

      expect(formatTimeWithUnit(14, "hour-of-day", options)).toEqual("14:00");
    });

    it("should format hour-of-day with custom precision", () => {
      const options = {
        time_style: "HH:mm",
        time_enabled: "seconds",
      };

      expect(formatTimeWithUnit(14.4, "hour-of-day", options)).toEqual(
        "14:00:00",
      );
    });

    it("should format hour-of-day with a custom format", () => {
      const options = {
        time_format: "HH",
      };

      expect(formatTimeWithUnit(14.4, "hour-of-day", options)).toEqual("14");
    });
  });

  describe("slugify", () => {
    it("should slugify Chinese", () => {
      expect(slugify("類型")).toEqual("%E9%A1%9E%E5%9E%8B");
    });

    it("should slugify multiple words", () => {
      expect(slugify("Test Parameter")).toEqual("test_parameter");
    });

    it("should slugify Russian", () => {
      expect(slugify("русский язык")).toEqual(
        "%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
      );
    });

    it("should slugify diacritics", () => {
      expect(slugify("än umlaut")).toEqual("%C3%A4n_umlaut");
    });
  });

  describe("getCurrencySymbol", () => {
    const currencySymbols = [
      ["USD", "$"],
      ["EUR", "€"],
      ["GBP", "£"],
      ["JPY", "¥"],
      ["CNY", "CN¥"],
      ["CAD", "CA$"],
      ["AUD", "AU$"],
      ["NZD", "NZ$"],
      ["HKD", "HK$"],
      ["BTC", "₿"],
      ["OOPS", "OOPS"],
    ];

    currencySymbols.forEach(([currency, symbol]) => {
      it(`should get a ${symbol} for ${currency}`, () => {
        expect(getCurrencySymbol(currency)).toEqual(symbol);
      });
    });
  });
});
