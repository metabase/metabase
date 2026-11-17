import type { ReactNode } from "react";

import { Box, Stack, rem } from "metabase/ui";
import { ScalarLabel } from "metabase/visualizations/components/ScalarValue/ScalarLabel";
import type { ScalarSizeTier } from "metabase/visualizations/components/ScalarValue/sizing";

import { TrendComparisonRow } from "./TrendComparisonRow";
import { TrendComparisonStack } from "./TrendComparisonStack";
import type { Trend } from "./compute";

interface TrendCardComparisonProps {
  tier: ScalarSizeTier;
  title: ReactNode;
  description?: string | null;
  trend: Trend;
  availableWidth: number;
  listsAllComparisons: boolean;
}

export function TrendCardComparison({
  tier,
  title,
  description,
  trend,
  availableWidth,
  listsAllComparisons,
}: TrendCardComparisonProps) {
  const titleWithDescription = title ? (
    <ScalarLabel description={description}>{title}</ScalarLabel>
  ) : null;

  if (trend.comparisons.length === 0) {
    return titleWithDescription;
  }

  if (tier.size === 100) {
    return (
      <Stack align="center" gap="xxs" w="100%">
        {titleWithDescription}
        <TrendComparisonRow
          trend={trend}
          formatOptions={trend.formatOptions}
          percentOnly
          showComparisonCount={false}
        />
      </Stack>
    );
  }

  if (tier.size === 150) {
    return (
      <ScalarLabel description={description}>
        {title}
        <Box flex="0 0 auto">
          <TrendComparisonRow
            trend={trend}
            formatOptions={trend.formatOptions}
            percentOnly
          />
        </Box>
      </ScalarLabel>
    );
  }

  return (
    <>
      {titleWithDescription}
      <Box
        pos="absolute"
        top={`calc(100% + ${rem(tier.comparisonGap)})`}
        left="50%"
        // Measured pixels must not be rem-scaled.
        w={`${availableWidth}px`}
        style={{ transform: "translateX(-50%)" }}
      >
        {listsAllComparisons ? (
          <TrendComparisonStack
            trend={trend}
            formatOptions={trend.formatOptions}
          />
        ) : (
          <TrendComparisonRow
            trend={trend}
            formatOptions={trend.formatOptions}
          />
        )}
      </Box>
    </>
  );
}
