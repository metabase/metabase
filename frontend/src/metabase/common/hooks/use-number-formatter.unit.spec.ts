import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import type { NumberFormattingSettings } from "metabase-types/api";

import {
  type UseFormatNumberOptions,
  useNumberFormatter,
} from "./use-number-formatter";

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
