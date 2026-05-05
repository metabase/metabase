import { t } from "ttag";

import { Button, Divider, Flex, Icon } from "metabase/ui";

import { ChartTypePicker } from "./ChartTypePicker";
import { TimeGranularityControl } from "./TimeGranularityControl";
import { TimeRangeControl } from "./TimeRangeControl";
import type { QueryExplorerBarProps } from "./types";

export type {
  QueryExplorerBarChartType,
  QueryExplorerBarProps,
  TimeGranularityConfig,
  TimeGranularityItem,
  TimeRangeConfig,
} from "./types";

export function QueryExplorerBar({
  chartTypes,
  currentChartType,
  onChartTypeChange,
  timeRange,
  timeGranularity,
  onExplore,
}: QueryExplorerBarProps) {
  const hasCenterControls = timeRange || timeGranularity;
  const hasChartTypes = chartTypes.length > 0;

  return (
    <Flex
      w="100%"
      direction={{ base: "column", xs: "row" }}
      align={{ base: "flex-start", xs: "center" }}
      justify={{ base: "flex-start", xs: "space-between" }}
      gap={{ base: "sm", xs: "xs" }}
      data-testid="query-explorer-bar"
    >
      {hasChartTypes && (
        <Flex align="center" gap="xs">
          <ChartTypePicker
            chartTypes={chartTypes}
            value={currentChartType}
            onChange={onChartTypeChange}
          />
        </Flex>
      )}

      {hasCenterControls && (
        <Flex
          h={32}
          align="stretch"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          style={{ overflow: "hidden" }}
        >
          {timeRange && <TimeRangeControl timeRange={timeRange} />}

          {timeRange && timeGranularity && <Divider orientation="vertical" />}

          {timeGranularity && (
            <TimeGranularityControl timeGranularity={timeGranularity} />
          )}
        </Flex>
      )}

      {onExplore && (
        <Flex align="center">
          <Button
            variant="default"
            size="xs"
            h={32}
            px="10px"
            leftSection={<Icon name="click" size={12} />}
            onClick={onExplore}
            bg="transparent"
          >
            {t`Explore`}
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
