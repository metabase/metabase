import { useCallback } from "react";

import { useSetting } from "metabase/common/hooks";
import {
  type FormatNumberOptions,
  formatNumber,
} from "metabase/lib/formatting/numbers";

export type UseFormatNumberOptions = FormatNumberOptions & {
  ignoreInstanceSettings?: boolean;
};

export type NumberFormatter = (
  number: number | bigint,
  options?: UseFormatNumberOptions,
) => string;

/**
 * Returns a function that formats a number using the given options,
 * but additionally respects the Metabase instance formatting settings.
 */
export function useNumberFormatter(
  options?: UseFormatNumberOptions,
): NumberFormatter {
  const formattingSettings = useSetting("custom-formatting");
  const numberFormattingSettings = options?.ignoreInstanceSettings
    ? null
    : (formattingSettings?.["type/Number"] ?? null);

  const formatter = useCallback(
    (number: number | bigint, innerOptions: FormatNumberOptions = {}) =>
      formatNumber(number, {
        ...numberFormattingSettings,
        ...options,
        ...innerOptions,
      }),
    [numberFormattingSettings, options],
  );

  return formatter;
}
