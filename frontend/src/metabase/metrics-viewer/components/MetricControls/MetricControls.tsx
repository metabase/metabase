import { useMemo } from "react";
import { t } from "ttag";

import type { TabInfo } from "metabase/metrics-viewer/utils/tabs";
import { Button, Divider, Flex, Icon } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit, VisualizationSettings } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../../types/viewer-state";
import { getProjectionInfo } from "../../utils/definition-builder";
import type { DimensionFilterValue } from "../../utils/dimension-filters";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../../utils/dimension-picker";
import { getTabConfig } from "../../utils/tab-config";
import { AddDimensionPopover } from "../MetricsViewerTabs/AddDimensionPopover";

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
  tabLabel?: string | null;
  dimensionFilter?: DimensionFilterValue;
  allFilterDimensions?: DimensionMetadata[];
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  canAddScalarTab: boolean;
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onDimensionFilterChange: (value: DimensionFilterValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange: (binningStrategy: string | undefined) => void;
  onAddTab: (tabInfo: TabInfo) => void;
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
  tabLabel,
  dimensionFilter,
  allFilterDimensions,
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  canAddScalarTab,
  onDisplayTypeChange,
  onDimensionFilterChange,
  onTemporalUnitChange,
  onBinningChange,
  onAddTab,
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

  const hasSharedDimensions = availableDimensions.shared.length > 0;
  const hasAnySourceDimensions = sourceOrder.some(
    (sourceId) => (availableDimensions.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableDimensions = hasSharedDimensions || hasAnySourceDimensions;
  const columnPickerLabel = tabLabel ?? t`Select column`;

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
          {hasAvailableDimensions && (
            <>
              <AddDimensionPopover
                availableDimensions={availableDimensions}
                sourceOrder={sourceOrder}
                sourceDataById={sourceDataById}
                hasMultipleSources={hasMultipleSources}
                onAddTab={onAddTab}
                canAddScalarTab={canAddScalarTab}
                renderTrigger={({ toggle }) => (
                  <Button
                    w={184}
                    justify="space-between"
                    fw="bold"
                    py="xs"
                    px="sm"
                    aria-label={t`Change column`}
                    variant="subtle"
                    color="text-primary"
                    rightSection={<Icon name="chevrondown" size={12} />}
                    onClick={toggle}
                  >
                    {columnPickerLabel}
                  </Button>
                )}
              />
              <Divider orientation="vertical" className={S.divider} mx="xs" />
            </>
          )}
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
