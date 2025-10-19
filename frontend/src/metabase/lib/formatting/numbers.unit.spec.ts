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
