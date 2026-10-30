import { Ellipsified, Flex, Stack, Text } from "metabase/ui";
import type { ColumnSettings } from "metabase-types/api";

import S from "./TrendComparisonList.module.css";
import { type ComparisonResult, getComparisonDisplay } from "./compute";
import { getChangeText } from "./utils";

const LIST_WIDTH = 360;

interface TrendComparisonListProps {
  comparisons: ComparisonResult[];
  formatOptions: ColumnSettings;
}

export function TrendComparisonList({
  comparisons,
  formatOptions,
}: TrendComparisonListProps) {
  return (
    <Stack
      w={LIST_WIDTH}
      maw="100%"
      gap={0}
      data-testid="scalar-comparison-list"
    >
      {comparisons.map((comparison, index) => {
        const display = getComparisonDisplay(comparison, formatOptions);

        return (
          <Flex
            key={index}
            align="center"
            justify="space-between"
            gap="lg"
            className={S.row}
            data-testid="scalar-previous-value"
          >
            <Ellipsified showTooltip={false}>
              <Text component="span" fz="md" lh="md" c="text-secondary">
                {comparison.comparisonDescStr}
              </Text>
            </Ellipsified>
            <Text
              component="span"
              fz="md"
              lh="md"
              flex="0 0 auto"
              c={display.sentimentColor ?? "text-primary"}
            >
              {getChangeText(display)}
            </Text>
          </Flex>
        );
      })}
    </Stack>
  );
}
