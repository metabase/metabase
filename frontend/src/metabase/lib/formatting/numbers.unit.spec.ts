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
});
