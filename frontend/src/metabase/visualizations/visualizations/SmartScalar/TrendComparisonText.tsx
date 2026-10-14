import { Text } from "metabase/ui";
import type { ColumnSettings } from "metabase-types/api";

import {
  type ComparisonResult,
  type SmartScalarDisplayValue,
  getComparisonDisplay,
} from "./compute";
import { TEXT_SPACING } from "./constants";

export const COMPARISON_TEXT_GAPS = { sm: TEXT_SPACING, lg: 6 } as const;

export type TrendComparisonTextSize = keyof typeof COMPARISON_TEXT_GAPS;

interface TrendComparisonTextProps {
  comparison: ComparisonResult;
  date: SmartScalarDisplayValue;
  formatOptions: ColumnSettings;
  size?: TrendComparisonTextSize;
  percentOnly?: boolean;
  compactValue?: boolean;
}

export function TrendComparisonText({
  comparison,
  date,
  formatOptions,
  size = "sm",
  percentOnly = false,
  compactValue = true,
}: TrendComparisonTextProps) {
  const { comparisonDescStr, comparisonDescShortStr } = comparison;
  const { isChanged, signedPercent, valueDisplay, sentimentColor } =
    getComparisonDisplay(comparison, formatOptions, { compact: compactValue });

  const changeColor = sentimentColor ?? "text-secondary";

  if (percentOnly) {
    return (
      <Text component="span" fz={size} lh={size} c={changeColor}>
        {signedPercent}
      </Text>
    );
  }

  const changeDesc = isChanged
    ? (comparisonDescShortStr ?? comparisonDescStr)
    : comparisonDescStr;
  const changeText = [signedPercent, changeDesc].filter(Boolean).join(" ");
  const hasDate = date != null && date !== "";
  const hasValue = valueDisplay != null && valueDisplay !== "";

  return (
    <>
      {hasDate && (
        <Text
          component="span"
          fz={size}
          lh={size}
          c="text-secondary"
          mr={COMPARISON_TEXT_GAPS[size]}
        >
          <span data-testid="scalar-period">{date}</span>
          {","}
        </Text>
      )}
      <Text component="span" fz={size} lh={size} c={changeColor}>
        {changeText}
      </Text>
      {hasValue && (
        <Text component="span" fz={size} lh={size} c={changeColor}>
          {isChanged ? <> ({valueDisplay})</> : <> {valueDisplay}</>}
        </Text>
      )}
    </>
  );
}
