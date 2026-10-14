import { Ellipsified, Stack, Text } from "metabase/ui";
import type { ColumnSettings } from "metabase-types/api";

import { getChangeText } from "./TrendComparisonList";
import { TrendComparisonText } from "./TrendComparisonText";
import {
  type ComparisonResult,
  type Trend,
  getComparisonDisplay,
} from "./compute";
import { TEXT_SPACING } from "./constants";

const ROW_GAP = 8;

interface SecondaryComparisonLineProps {
  comparison: ComparisonResult;
  formatOptions: ColumnSettings;
}

function SecondaryComparisonLine({
  comparison,
  formatOptions,
}: SecondaryComparisonLineProps) {
  const display = getComparisonDisplay(comparison, formatOptions);

  return (
    <>
      <Text
        component="span"
        fz="sm"
        lh="sm"
        c="text-secondary"
        mr={TEXT_SPACING}
      >
        {comparison.comparisonDescStr}
        {","}
      </Text>
      <Text
        component="span"
        fz="sm"
        lh="sm"
        c={display.sentimentColor ?? "text-primary"}
      >
        {getChangeText(display)}
      </Text>
    </>
  );
}

interface TrendComparisonStackProps {
  trend: Trend;
  formatOptions: ColumnSettings;
}

export function TrendComparisonStack({
  trend,
  formatOptions,
}: TrendComparisonStackProps) {
  const { comparisons, display } = trend;

  return (
    <Stack
      gap={ROW_GAP}
      align="center"
      maw="100%"
      data-testid="scalar-comparison-list"
    >
      {comparisons.map((comparison, index) => (
        <Ellipsified
          key={index}
          fz="sm"
          lh="sm"
          ta="center"
          maw="100%"
          data-testid="scalar-previous-value"
        >
          {index === 0 ? (
            <TrendComparisonText
              comparison={comparison}
              date={display.date}
              formatOptions={formatOptions}
            />
          ) : (
            <SecondaryComparisonLine
              comparison={comparison}
              formatOptions={formatOptions}
            />
          )}
        </Ellipsified>
      ))}
    </Stack>
  );
}
