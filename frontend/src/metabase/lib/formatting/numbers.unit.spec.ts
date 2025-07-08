import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import type { NumberFormattingSettings } from "metabase-types/api";

import {
  type UseFormatNumberOptions,
  formatNumber,
  numberFormatterForOptions,
  useNumberFormatter,
} from "./numbers";

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

describe("useNumberFormatter", () => {
  function setup(
    settings?: NumberFormattingSettings,
    options: UseFormatNumberOptions = {},
  ) {
    const { result } = renderHookWithProviders(
      () => useNumberFormatter(options),
      {
        storeInitialState: {
          settings: mockSettings({
            "custom-formatting": {
              "type/Number": settings ?? {},
            },
          }),
        },
      },
    );
    return result.current;
  }

  it("should use the instance settings", () => {
    {
      const formatNumber = setup({
        number_separators: ".,",
      });
      expect(formatNumber(2000.45)).toBe("2,000.45");
    }
    {
      const formatNumber = setup({
        number_separators: ".",
      });
      expect(formatNumber(2000.45)).toBe("2000.45");
    }
  });

  it("should use the instance settings and allow other setting to be set", () => {
    const formatNumber = setup({
      number_separators: ".",
    });
    expect(formatNumber(2000.45, { decimals: 0 })).toBe("2000");
  });

  it("should use the instance settings and allow other setting to be set in hook", () => {
    const formatNumber = setup(
      {
        number_separators: ".",
      },
      { decimals: 0 },
    );

    expect(formatNumber(2000.45)).toBe("2000");
  });

  it("should be possible to ignore the instance settings", () => {
    const formatNumber = setup(
      {
        number_separators: ".",
      },
      { ignoreInstanceSettings: true },
    );

    expect(formatNumber(2000.45)).toBe("2,000.45");
  });
});
