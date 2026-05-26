import { getCurrencyStyleOptions, getCurrencySymbol } from "./currency";

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
      { name: "Local symbol ($)", value: "narrowSymbol" },
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

  it("should include current value even if it would normally be hidden", () => {
    const options = getCurrencyStyleOptions("USD", "narrowSymbol");
    expect(options).toEqual([
      { name: "Symbol ($)", value: "symbol" },
      { name: "Local symbol ($)", value: "narrowSymbol" },
      { name: "Code (USD)", value: "code" },
      { name: "Name (US dollars)", value: "name" },
    ]);
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
