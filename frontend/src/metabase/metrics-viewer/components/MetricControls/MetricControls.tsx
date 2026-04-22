import { useMemo } from "react";

import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit, VisualizationSettings } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../../types/viewer-state";
import { getProjectionInfo } from "../../utils/definition-builder";
import type { DimensionFilterValue } from "../../utils/dimension-filters";
import { getTabConfig } from "../../utils/tab-config";
import { QueryExplorerBar } from "../QueryExplorerBar";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import { ChartLayoutPicker } from "./ChartLayoutPicker";
import { DimensionFilterButton } from "./DimensionFilterButton";

function isValidDisplayTypeForTab(
  displayType: MetricsViewerDisplayType,
  tabType: MetricsViewerTabType,
): boolean {
  const config = getTabConfig(tabType);
  return config.availableDisplayTypes.some((t) => t.type === displayType);
}

type MetricControlsProps = {
  definition: MetricDefinition;
  displayType: MetricsViewerDisplayType;
  tabType: MetricsViewerTabType;
  dimensionFilter?: DimensionFilterValue;
  allFilterDimensions?: DimensionMetadata[];
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onDimensionFilterChange: (value: DimensionFilterValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange: (binningStrategy: string | undefined) => void;
  showStackSeries?: boolean;
  visualizationSettings?: Partial<VisualizationSettings>;
  onVisualizationSettingsChange?: (
    updates: Partial<VisualizationSettings>,
  ) => void;
};

export function MetricControls({
  definition,
  displayType,
  tabType,
  dimensionFilter,
  allFilterDimensions,
  onDisplayTypeChange,
  onDimensionFilterChange,
  onTemporalUnitChange,
  onBinningChange,
  showStackSeries,
  visualizationSettings,
  onVisualizationSettingsChange,
}: MetricControlsProps) {
  const projectionInfo = useMemo(
    () => getProjectionInfo(definition),
    [definition],
  );

  const hasFilterControls =
    projectionInfo.projection && projectionInfo.filterDimension;

  const hasBucketControls =
    hasFilterControls && projectionInfo.isTemporalBucketable;

  const hasBinningControls =
    !hasBucketControls &&
    projectionInfo.projection &&
    projectionInfo.projectionDimension &&
    (projectionInfo.isBinnable || projectionInfo.hasBinning);

  const config = getTabConfig(tabType);
  const chartTypes = config.availableDisplayTypes;
  const effectiveDisplayType = isValidDisplayTypeForTab(displayType, tabType)
    ? displayType
    : config.defaultDisplayType;

  return (
    <QueryExplorerBar
      chartTypes={chartTypes}
      currentChartType={effectiveDisplayType}
      onChartTypeChange={(type) =>
        onDisplayTypeChange(type as MetricsViewerDisplayType)
      }
      layoutControl={
        showStackSeries && onVisualizationSettingsChange ? (
          <ChartLayoutPicker
            isStacked={!!visualizationSettings?.["graph.split_panels"]}
            onToggle={(stacked) =>
              onVisualizationSettingsChange({ "graph.split_panels": stacked })
            }
          />
        ) : undefined
      }
      filterControl={
        hasFilterControls && projectionInfo.filterDimension ? (
          <DimensionFilterButton
            definition={definition}
            filterDimension={projectionInfo.filterDimension}
            dimensionFilter={dimensionFilter}
            allFilterDimensions={allFilterDimensions}
            onChange={onDimensionFilterChange}
          />
        ) : undefined
      }
      granularityControl={
        hasBucketControls && projectionInfo.projectionDimension ? (
          <BucketButton
            definition={definition}
            dimension={projectionInfo.projectionDimension}
            projection={projectionInfo.projection!}
            onChange={onTemporalUnitChange}
          />
        ) : hasBinningControls && projectionInfo.projectionDimension ? (
          <BinningButton
            definition={definition}
            dimension={projectionInfo.projectionDimension}
            projection={projectionInfo.projection!}
            onBinningChange={onBinningChange}
          />
        ) : undefined
      }
    />
  );
}
