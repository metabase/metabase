import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";

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
      h="32px"
      align="center"
      justify="space-between"
      data-testid="query-explorer-bar"
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

      {/* Center: time range + granularity */}
      {(filterControl || granularityControl) && (
        <Flex align="center" gap="xs">
          {filterControl}
          {granularityControl}
        </Flex>
      )}

      {/* Right: explore */}
      {exploreControl && <Flex align="center">{exploreControl}</Flex>}
    </Flex>
  );
}
