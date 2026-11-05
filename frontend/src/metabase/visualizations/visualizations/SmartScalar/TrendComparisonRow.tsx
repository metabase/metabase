import { Badge, Box, Flex, Tooltip } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";
import { SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS } from "metabase/viz-core";
import type { ColumnSettings } from "metabase-types/api";

import {
  COMPARISON_PANEL_TOOLTIP_PROPS,
  TrendComparisonPanel,
} from "./TrendComparisonPanel";
import S from "./TrendComparisonRow.module.css";
import {
  COMPARISON_TEXT_GAPS,
  TrendComparisonText,
  type TrendComparisonTextSize,
} from "./TrendComparisonText";
import type { ComparisonResult, Trend } from "./compute";

interface TrendComparisonRowProps {
  trend: Trend;
  formatOptions: ColumnSettings;
  percentOnly?: boolean;
  showComparisonCount?: boolean;
  size?: TrendComparisonTextSize;
  compactValue?: boolean;
}

export function TrendComparisonRow({
  trend,
  formatOptions,
  percentOnly = false,
  showComparisonCount = true,
  size = "sm",
  compactValue = true,
}: TrendComparisonRowProps) {
  const { isTruncated, ref: comparisonTextRef } =
    useIsTruncated<HTMLDivElement>({ ignoreHeightTruncation: true });

  const { comparisons, display } = trend;
  const comparison: ComparisonResult | undefined = comparisons[0];

  if (comparison == null) {
    return null;
  }

  const extraComparisonsCount = comparisons.length - 1;

  const showsPanel = percentOnly || extraComparisonsCount > 0 || isTruncated;

  return (
    <Tooltip
      {...COMPARISON_PANEL_TOOLTIP_PROPS}
      disabled={!showsPanel}
      label={
        <TrendComparisonPanel
          comparisons={comparisons}
          formatOptions={formatOptions}
        />
      }
    >
      <Flex
        gap={COMPARISON_TEXT_GAPS[size]}
        align="center"
        justify="center"
        maw="100%"
        fz={size}
        lh={size}
        tabIndex={showsPanel ? 0 : undefined}
        data-testid="scalar-previous-value"
      >
        <Box ref={comparisonTextRef} className={S.comparisonText}>
          <TrendComparisonText
            comparison={comparison}
            date={display.date}
            formatOptions={formatOptions}
            size={size}
            percentOnly={percentOnly}
            compactValue={compactValue}
          />
        </Box>
        {showComparisonCount && extraComparisonsCount > 0 && (
          <Badge
            px={6}
            size="xs"
            variant="light"
            c="text-primary"
            flex="0 0 auto"
            className={SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS}
          >
            +{extraComparisonsCount}
          </Badge>
        )}
      </Flex>
    </Tooltip>
  );
}
