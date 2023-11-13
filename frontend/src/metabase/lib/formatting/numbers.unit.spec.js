import { formatNumber, numberFormatterForOptions } from "./numbers";

describe("formatNumber", () => {
  it("should show the correct currency format (metabase#34242)", () => {
    const numberFormatter = numberFormatterForOptions({
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
      maximumFractionDigits: 2,
    });

    const compactResult = formatNumber(-500000, {
      jsx: true,
      remap: true,
      field: "-500000",
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
      _header_unit: "$",
      column: {
        display_name: "-500000",
        source: "native",
        field_ref: [
          "field",
          "-500000",
          {
            "base-type": "type/Integer",
          },
        ],
        name: "-500000",
        base_type: "type/Integer",
        effective_type: "type/Integer",
      },
      _column_title_full: "-500000 ($)",
      compact: true,
    });
    expect(compactResult).toEqual("-$500.0k");

    const fullResult = formatNumber(-500000, {
      compact: false,
      maximumFractionDigits: 2,
      jsx: true,
      remap: true,
      field: "-500000",
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
      _header_unit: "$",
      column: {
        display_name: "-500000",
        source: "native",
        field_ref: [
          "field",
          "-500000",
          {
            "base-type": "type/Integer",
          },
        ],
        name: "-500000",
        base_type: "type/Integer",
        effective_type: "type/Integer",
      },
      _column_title_full: "-500000 ($)",
    });
    expect(fullResult).toEqual("-$500,000.00");
  });
});
