import { useMemo } from "react";

import { Divider, Flex } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit, VisualizationSettings } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../../types/viewer-state";
import { getProjectionInfo } from "../../utils/definition-builder";
import type { DimensionFilterValue } from "../../utils/dimension-filters";
import { getTabConfig } from "../../utils/tab-config";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import { ChartLayoutPicker } from "./ChartLayoutPicker";
import { ChartTypePicker } from "./ChartTypePicker";
import { DimensionFilterButton } from "./DimensionFilterButton";
import S from "./MetricControls.module.css";

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
    <Flex
      h="3rem"
      className={S.container}
      display="inline-flex"
      bg="background-primary"
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      px="sm"
      align="center"
      gap="xs"
      data-testid="metrics-viewer-controls"
    >
      <ChartTypePicker
        chartTypes={chartTypes}
        value={effectiveDisplayType}
        onChange={onDisplayTypeChange}
      />
      {showStackSeries && onVisualizationSettingsChange && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          <ChartLayoutPicker
            isStacked={!!visualizationSettings?.["graph.split_panels"]}
            onToggle={(stacked) =>
              onVisualizationSettingsChange({
                "graph.split_panels": stacked,
              })
            }
          />
        </>
      )}
      {hasFilterControls && projectionInfo.filterDimension && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          <DimensionFilterButton
            definition={definition}
            filterDimension={projectionInfo.filterDimension}
            dimensionFilter={dimensionFilter}
            allFilterDimensions={allFilterDimensions}
            onChange={onDimensionFilterChange}
          />
        </>
      )}
      {hasBucketControls && projectionInfo.projectionDimension && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          <BucketButton
            definition={definition}
            dimension={projectionInfo.projectionDimension}
            projection={projectionInfo.projection!}
            onChange={onTemporalUnitChange}
          />
        </>
      )}
      {hasBinningControls && projectionInfo.projectionDimension && (
        <>
          <Divider orientation="vertical" className={S.divider} mx="xs" />
          <BinningButton
            definition={definition}
            dimension={projectionInfo.projectionDimension}
            projection={projectionInfo.projection!}
            onBinningChange={onBinningChange}
          />
        </>
      )}
    </Flex>
  );
}
