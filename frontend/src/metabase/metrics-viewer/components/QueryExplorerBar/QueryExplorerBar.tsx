import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { Divider, Flex } from "metabase/ui";

import type { MetricsViewerDisplayType } from "../../types/viewer-state";
import type { ChartTypeOption } from "../../utils/tab-config";
import { ChartLayoutPicker } from "../MetricControls/ChartLayoutPicker";
import { ChartTypePicker } from "../MetricControls/ChartTypePicker";

export type QueryExplorerBarChartType = {
  /** The identifier for this chart type (e.g. line, bar, area) */
  type: string;

  /** Icon to display for this chart type */
  icon: IconName;
};

export type QueryExplorerBarLayout = {
  isStacked: boolean;
  onToggle: (stacked: boolean) => void;
};

export type QueryExplorerBarProps = {
  /** Available chart types to display as selectable buttons */
  chartTypes: QueryExplorerBarChartType[];

  /** Currently selected chart type */
  currentChartType: string;

  /** Called when a chart type button is clicked */
  onChartTypeChange: (type: string) => void;

  /** Optional stack/split layout toggle, shown after chart types */
  layout?: QueryExplorerBarLayout;

  /** Optional slot for a filter control (e.g. date range picker) */
  filterControl?: ReactNode;

  /** Optional slot for a time granularity control (e.g. temporal bucket picker) */
  granularityControl?: ReactNode;

  /** Optional slot for an action button on the right (e.g. explore) */
  exploreControl?: ReactNode;
};

export function QueryExplorerBar({
  chartTypes,
  currentChartType,
  onChartTypeChange,
  layout,
  filterControl,
  granularityControl,
  exploreControl,
}: QueryExplorerBarProps) {
  return (
    <Flex
      w="100%"
      align="center"
      direction="row"
      wrap={{ base: "nowrap", xs: "wrap" }}
      justify="space-between"
      gap="xs"
      data-testid="query-explorer-bar"
      px="lg"
    >
      {/* Left: viz type selectors */}
      <Flex align="center" gap="xs">
        <ChartTypePicker
          chartTypes={chartTypes as ChartTypeOption[]}
          value={currentChartType as MetricsViewerDisplayType}
          onChange={onChartTypeChange}
        />

        {layout && (
          <ChartLayoutPicker
            isStacked={layout.isStacked}
            onToggle={layout.onToggle}
          />
        )}
      </Flex>

      {/* Center: time range + granularity as a pill group */}
      {(filterControl || granularityControl) && (
        <Flex
          h="1.875rem"
          align="stretch"
          bd="1px solid var(--mb-color-border)"
          bdrs="xl"
          style={{ overflow: "hidden" }}
        >
          {filterControl}
          {filterControl && granularityControl && (
            <Divider orientation="vertical" />
          )}
          {granularityControl}
        </Flex>
      )}

      {/* Right: explore */}
      {exploreControl && <Flex align="center">{exploreControl}</Flex>}
    </Flex>
  );
}
