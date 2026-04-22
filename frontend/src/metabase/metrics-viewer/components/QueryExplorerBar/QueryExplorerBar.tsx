import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { Divider, Flex } from "metabase/ui";

import { ChartLayoutPicker } from "../MetricControls/ChartLayoutPicker";
import type { ChartTypeOption } from "../MetricControls/ChartTypePicker";
import { ChartTypePicker } from "../MetricControls/ChartTypePicker";
import type { MetricsViewerDisplayType } from "../types/viewer-state";

import S from "./QueryExplorerBar.module.css";

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
};

export function QueryExplorerBar({
  chartTypes,
  currentChartType,
  onChartTypeChange,
  layout,
  filterControl,
  granularityControl,
}: QueryExplorerBarProps) {
  return (
    <Flex
      maw="100%"
      h="3rem"
      display="inline-flex"
      bg="background-primary"
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      px="sm"
      align="center"
      gap="xs"
      data-testid="query-explorer-bar"
    >
      <ChartTypePicker
        chartTypes={chartTypes as ChartTypeOption[]}
        value={currentChartType as MetricsViewerDisplayType}
        onChange={onChartTypeChange}
      />

      {layout && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          <ChartLayoutPicker
            isStacked={layout.isStacked}
            onToggle={layout.onToggle}
          />
        </>
      )}

      {filterControl && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          {filterControl}
        </>
      )}

      {granularityControl && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          {granularityControl}
        </>
      )}
    </Flex>
  );
}
