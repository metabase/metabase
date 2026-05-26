import { formatNumber, numberFormatterForOptions } from "./numbers";

describe("formatNumber", () => {
  it("should respect the decimals setting even when compact is true (metabase#54063)", () => {
    const result = formatNumber(4.271250189320243, {
      compact: true,
      decimals: 0,
    });

    expect(result).toEqual("4");
  });

  it("should show the correct currency format (metabase#34242)", () => {
    const numberFormatter = numberFormatterForOptions({
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
      maximumFractionDigits: 2,
    });

    const compactResult = formatNumber(-500000, {
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
      compact: true,
    });
    expect(compactResult).toEqual("-$500.0k");

    const fullResult = formatNumber(-500000, {
      compact: false,
      maximumFractionDigits: 2,
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
    });
    expect(fullResult).toEqual("-$500,000.00");
  });

  it("should work with scientific notation (metabase#25222)", () => {
    expect(
      formatNumber(0.000000000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.5e-11");

    expect(
      formatNumber(1.000000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.000000015e+0");

    expect(
      formatNumber(1.000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.000015e+0");
  });

  describe("compact mode with decimals setting", () => {
    it("should respect various decimal settings in compact mode (metabase#63145)", () => {
      const value = 1234567;

      expect(
        formatNumber(value, {
          compact: true,
          decimals: 0,
        }),
      ).toBe("1M");

      expect(
        formatNumber(value, {
          compact: true,
          decimals: 1,
        }),
      ).toBe("1.2M");

      expect(
        formatNumber(value, {
          compact: true,
          decimals: 2,
        }),
      ).toBe("1.23M");

      expect(
        formatNumber(value, {
          compact: true,
          decimals: 3,
        }),
      ).toBe("1.235M");

      expect(
        formatNumber(value, {
          compact: true,
          decimals: 4,
        }),
      ).toBe("1.2346M");
    });
  });

  describe("formatNumber – compact rounding (metabase#59454)", () => {
    it("rounds billions with 0 decimals", () => {
      expect(
        formatNumber(1_499_999_999, {
          compact: true,
          maximumFractionDigits: 0,
        }),
      ).toBe("1B");
      expect(
        formatNumber(1_500_000_000, {
          compact: true,
          maximumFractionDigits: 0,
        }),
      ).toBe("2B");
      expect(
        formatNumber(1_949_999_999, {
          compact: true,
          maximumFractionDigits: 0,
        }),
      ).toBe("2B");
    });

    it("carries to the next unit at 999.5M (0 decimals)", () => {
      expect(
        formatNumber(999_499_999, { compact: true, maximumFractionDigits: 0 }),
      ).toBe("999M");
      expect(
        formatNumber(999_500_000, { compact: true, maximumFractionDigits: 0 }),
      ).toBe("1B");
    });

    it("keeps sign with rounding", () => {
      expect(
        formatNumber(-1_950_000_000, {
          compact: true,
          maximumFractionDigits: 0,
        }),
      ).toBe("-2B");
    });

    it("respects explicit decimals when provided", () => {
      expect(
        formatNumber(1_950_000_000, {
          compact: true,
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      ).toBe("2.0B");
    });
  });

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
      expect(formatNumber(-4, { negativeInParentheses: true })).toEqual("(4)");
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

    it("should format large numbers correctly with non-default number separator", () => {
      const options = { compact: true, number_separators: ",." };
      expect(formatNumber(10.1, options)).toEqual("10,1");
      expect(formatNumber(99999999.9, options)).toEqual("100,0M");
      expect(formatNumber(-10.1, options)).toEqual("-10,1");
      expect(formatNumber(-99999999.9, options)).toEqual("-100,0M");
    });

    it("should format big integers", () => {
      expect(formatNumber(9223372036854775807n, {})).toEqual(
        "9,223,372,036,854,775,807",
      );
    });

    it("should format big integers correctly with non-default number separators", () => {
      const options = { number_separators: ",." };
      expect(formatNumber(1000n, options)).toEqual("1.000");
    });

    it("should format big integers with scale options", () => {
      const options = { scale: 10 };
      expect(formatNumber(1000n, options)).toEqual("10,000");
    });

    it("should respect 'decimals' setting", () => {
      expect(formatNumber(500000, { compact: true, decimals: 0 })).toBe("500k");
      expect(formatNumber(500000, { compact: true })).toBe("500.0k");
      expect(formatNumber(10.1, { compact: true })).toBe("10.1");
      expect(formatNumber(10.1, { compact: true, decimals: 0 })).toBe("10");
      expect(formatNumber(99999999.9, { compact: true })).toBe("100.0M");
      expect(formatNumber(99999999.9, { compact: true, decimals: 0 })).toBe(
        "100M",
      );
    });

    it("should format percentages", () => {
      const options = { compact: true, number_style: "percent" };
      expect(formatNumber(0.867, { number_style: "percent" })).toEqual("86.7%");
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
      expect(formatNumber(1234567.89, { ...options, currency: "CNY" })).toEqual(
        "CN¥1.2M",
      );
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

describe("formatNumber with scale (multiply function)", () => {
  it("should multiply regular numbers with scale", () => {
    expect(formatNumber(5, { scale: 3 })).toBe("15");
    expect(formatNumber(2.5, { scale: 4 })).toBe("10");
  });

  it("should multiply bigint with integer scale", () => {
    expect(formatNumber(BigInt(5), { scale: 3 })).toBe("15");
    expect(formatNumber(BigInt(100), { scale: 7 })).toBe("700");
  });

  it("should convert bigint to number when scaling with float", () => {
    expect(formatNumber(BigInt(5), { scale: 2.5 })).toBe("12.5");
    expect(formatNumber(BigInt(10), { scale: 1.5 })).toBe("15");
  });

  it("should handle edge cases with scale", () => {
    expect(formatNumber(0, { scale: 5 })).toBe("0");
    expect(formatNumber(BigInt(0), { scale: 3 })).toBe("0");
    expect(formatNumber(BigInt(5), { scale: 0 })).toBe("0");
    expect(formatNumber(BigInt(5), { scale: 0.5 })).toBe("2.5");
  });

  it("should handle negative numbers with scale", () => {
    expect(formatNumber(-5, { scale: 3 })).toBe("-15");
    expect(formatNumber(BigInt(-5), { scale: 3 })).toBe("-15");
    expect(formatNumber(BigInt(-5), { scale: 2.5 })).toBe("-12.5");
  });
});
