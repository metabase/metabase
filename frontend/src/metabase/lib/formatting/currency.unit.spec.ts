import {
  getCurrencyStyleOptions,
  sortCurrencyOptionsByPriority,
} from "./currency";

describe("getCurrencyStyleOptions", () => {
  it("should get currency options - USD", () => {
    const options = getCurrencyStyleOptions("USD");
    expect(options).toEqual([
      { name: "Symbol ($)", value: "symbol" },
      { name: "Code (USD)", value: "code" },
      { name: "Name (US dollars)", value: "name" },
    ]);
  });

  it("should get currency options - NZD", () => {
    const options = getCurrencyStyleOptions("NZD");
    expect(options).toEqual([
      { name: "Symbol (NZ$)", value: "symbol" },
      { name: "Code (NZD)", value: "code" },
      { name: "Name (New Zealand dollars)", value: "name" },
    ]);
  });

  it("should get currency options - invalid", () => {
    const options = getCurrencyStyleOptions("PKMN");
    expect(options).toEqual([
      { name: "Code (PKMN)", value: "code" },
      { name: "Name (PKMN)", value: "name" },
    ]);
  });
});

describe("sortCurrencyOptionsByPriority", () => {
  it("should sort currencies with USD, CAD, EUR first, then alphabetically", () => {
    const input = [
      { label: "Brazilian Real", value: "BRL" },
      { label: "US Dollar", value: "USD" },
      { label: "Australian Dollar", value: "AUD" },
      { label: "Euro", value: "EUR" },
      { label: "Canadian Dollar", value: "CAD" },
      { label: "British Pound", value: "GBP" },
    ];

    const result = sortCurrencyOptionsByPriority(input);

    expect(result).toEqual([
      { label: "US Dollar", value: "USD" },
      { label: "Canadian Dollar", value: "CAD" },
      { label: "Euro", value: "EUR" },
      { label: "Australian Dollar", value: "AUD" },
      { label: "Brazilian Real", value: "BRL" },
      { label: "British Pound", value: "GBP" },
    ]);
  });

  it("should sort by custom key when provided", () => {
    const input = [
      { name: "Brazilian Real", value: "BRL" },
      { name: "US Dollar", value: "USD" },
      { name: "Australian Dollar", value: "AUD" },
    ];

    const result = sortCurrencyOptionsByPriority(input, "name");

    expect(result).toEqual([
      { name: "US Dollar", value: "USD" },
      { name: "Australian Dollar", value: "AUD" },
      { name: "Brazilian Real", value: "BRL" },
    ]);
  });

  it("should handle empty array", () => {
    const result = sortCurrencyOptionsByPriority([]);
    expect(result).toEqual([]);
  });

  it("should handle array with only priority currencies", () => {
    const input = [
      { label: "Euro", value: "EUR" },
      { label: "Canadian Dollar", value: "CAD" },
      { label: "US Dollar", value: "USD" },
    ];

    const result = sortCurrencyOptionsByPriority(input);

    expect(result).toEqual([
      { label: "US Dollar", value: "USD" },
      { label: "Canadian Dollar", value: "CAD" },
      { label: "Euro", value: "EUR" },
    ]);
  });
});
