import { formatNumber, numberFormatterForOptions } from "./numbers";

describe("formatNumber", () => {
  it("should respect the decimals setting even when compact is true (metabase#54063)", () => {
    const result = formatNumber(4.271250189320243, {
      compact: true,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      jsx: true,
      remap: true,
      field: "stddev",
      currency: "USD",
      number_style: "decimal",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ", ",
      decimals: 0,
      column: {
        database_type: "DOUBLE PRECISION",
        semantic_type: "type/Quantity",
        name: "stddev",
        settings: null,
        source: "aggregation",
        field_ref: ["aggregation", 0],
        effective_type: "type/Float",
        aggregation_index: 0,
        ident: "I7WK_71R1PnM2AiixvLvd",
        display_name: "Standard deviation of Quantity",
        base_type: "type/Float",
      },
      _column_title_full: "Standard deviation of Quantity",
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

  it("should work with durations", () => {
    expect(
      formatNumber(652000, {
        number_style: "duration",
      }),
    ).toEqual("10m 52s");

    expect(
      formatNumber(10652000, {
        number_style: "duration",
      }),
    ).toEqual("2h 57m 32s");

    expect(
      formatNumber(100620000, {
        number_style: "duration",
      }),
    ).toEqual("1d 3h 57m");
  });
});
