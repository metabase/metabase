import type { ReactNode } from "react";

import { Box, Flex, Stack, rem } from "metabase/ui";
import type { ScalarSizeTier } from "metabase/visualizations/components/ScalarValue/sizing";

import { TrendComparisonRow } from "./TrendComparisonRow";
import type { Trend } from "./compute";

interface TrendCardComparisonProps {
  tier: ScalarSizeTier;
  title: ReactNode;
  trend: Trend;
  availableWidth: number;
  isNarrow: boolean;
}

export function TrendCardComparison({
  tier,
  title,
  trend,
  availableWidth,
  isNarrow,
}: TrendCardComparisonProps) {
  if (trend.comparisons.length === 0) {
    return title;
  }

  if (tier.size === 100 || (tier.size === 150 && isNarrow)) {
    return (
      <Stack align="center" gap="xxs" maw="100%">
        {title}
        <TrendComparisonRow
          trend={trend}
          formatOptions={trend.formatOptions}
          percentOnly
          showComparisonCount={tier.size === 150}
        />
      </Stack>
    );
  }

  if (tier.size === 150) {
    return (
      <Flex align="center" justify="center" gap="xxs" maw="100%">
        {title}
        <Box flex="0 0 auto">
          <TrendComparisonRow
            trend={trend}
            formatOptions={trend.formatOptions}
            percentOnly
          />
        </Box>
      </Flex>
    );
  }

  return (
    <>
      {title}
      <Box
        pos="absolute"
        top={`calc(100% + ${rem(tier.comparisonGap)})`}
        left="50%"
        // Measured pixels must not be rem-scaled.
        w={`${availableWidth}px`}
        style={{ transform: "translateX(-50%)" }}
      >
        <TrendComparisonRow trend={trend} formatOptions={trend.formatOptions} />
      </Box>
    </>
  );
}
