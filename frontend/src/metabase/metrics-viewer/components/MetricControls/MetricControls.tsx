import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type {
  MetricsViewerDimensionBreakoutProjectionConfig,
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
} from "metabase/metrics-viewer/types";
import {
  type DimensionFilterValue,
  getDimensionBreakoutConfig,
  getDimensionIcon,
  getProjectionInfo,
} from "metabase/metrics-viewer/utils";
import { Box, Button, Flex, Icon } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit, VisualizationSettings } from "metabase-types/api";

import { CenterControls } from "./CenterControls";
import { LeftControls } from "./LeftControls";
import S from "./MetricControls.module.css";

function isValidDisplayTypeForDimensionBreakout(
  displayType: MetricsViewerDisplayType,
  dimensionBreakoutType: MetricsViewerDimensionBreakoutType,
): boolean {
  const config = getDimensionBreakoutConfig(dimensionBreakoutType);
  return config.availableDisplayTypes.some((t) => t.type === displayType);
}

type MetricControlsProps = {
  definition: MetricDefinition;
  allFilterDimensions?: DimensionMetadata[];
  showStackSeries?: boolean;
  canToggleColumnLabels?: boolean;
};

export function MetricControls({
  definition,
  allFilterDimensions,
  showStackSeries,
  canToggleColumnLabels,
}: MetricControlsProps) {
  const {
    activeDimensionBreakout: dimensionBreakout,
    availableDimensions,
    sourceOrder,
    showColumnLabels,
    setShowColumnLabels,
    updateActiveDimensionBreakout: onDimensionBreakoutUpdate,
    openSidebar,
  } = useMetricsViewerContext();

  const updateProjectionConfig = useCallback(
    (updates: Partial<MetricsViewerDimensionBreakoutProjectionConfig>) => {
      onDimensionBreakoutUpdate({
        projectionConfig: {
          ...dimensionBreakout?.projectionConfig,
          ...updates,
        },
      });
    },
    [onDimensionBreakoutUpdate, dimensionBreakout?.projectionConfig],
  );

  const handleDisplayTypeChange = useCallback(
    (display: MetricsViewerDisplayType) => {
      onDimensionBreakoutUpdate({ display });
    },
    [onDimensionBreakoutUpdate],
  );

  const handleDimensionFilterChange = useCallback(
    (value: DimensionFilterValue | undefined) => {
      updateProjectionConfig({ dimensionFilter: value });
    },
    [updateProjectionConfig],
  );

  const handleTemporalUnitChange = useCallback(
    (unit: TemporalUnit | undefined) => {
      updateProjectionConfig({ temporalUnit: unit });
    },
    [updateProjectionConfig],
  );

  const handleBinningChange = useCallback(
    (binningStrategy: string | undefined) => {
      updateProjectionConfig({ binningStrategy });
    },
    [updateProjectionConfig],
  );

  const handleShowColumnLabelsChange = useCallback(
    (showColumnLabels: boolean) => {
      setShowColumnLabels(showColumnLabels);
    },
    [setShowColumnLabels],
  );

  const handleVisualizationSettingsChange = useCallback(
    (updates: Partial<VisualizationSettings>) => {
      onDimensionBreakoutUpdate({
        visualizationSettings: {
          ...dimensionBreakout?.visualizationSettings,
          ...updates,
        },
      });
    },
    [onDimensionBreakoutUpdate, dimensionBreakout?.visualizationSettings],
  );

  const projectionInfo = useMemo(
    () => getProjectionInfo(definition),
    [definition],
  );

  if (!dimensionBreakout) {
    return null;
  }

  const {
    type: dimensionBreakoutType,
    label: dimensionBreakoutLabel,
    display: displayType,
    projectionConfig,
    visualizationSettings,
  } = dimensionBreakout;
  const dimensionFilter = projectionConfig.dimensionFilter;

  const hasFilterControls =
    projectionInfo.projection && projectionInfo.filterDimension;

  const hasBucketControls =
    hasFilterControls && projectionInfo.isTemporalBucketable;

  const hasBinningControls =
    !hasBucketControls &&
    projectionInfo.projection &&
    projectionInfo.projectionDimension &&
    (projectionInfo.isBinnable || projectionInfo.hasBinning);

  const config = getDimensionBreakoutConfig(dimensionBreakoutType);
  const chartTypes = config.availableDisplayTypes;
  const effectiveDisplayType = isValidDisplayTypeForDimensionBreakout(
    displayType,
    dimensionBreakoutType,
  )
    ? displayType
    : config.defaultDisplayType;
  const hasSharedDimensions = availableDimensions.shared.length > 0;
  const hasAnySourceDimensions = sourceOrder.some(
    (sourceId) => (availableDimensions.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableDimensions = hasSharedDimensions || hasAnySourceDimensions;
  const columnPickerLabel =
    dimensionBreakoutType === "time"
      ? t`Time`
      : (dimensionBreakoutLabel ?? t`Select column`);
  const columnPickerIcon = projectionInfo.projectionDimension
    ? getDimensionIcon(projectionInfo.projectionDimension)
    : undefined;

  if (dimensionBreakoutType === "scalar") {
    return (
      <Box className={S.root} data-testid="metrics-viewer-controls">
        <Flex className={S.centerCluster}>
          <Flex className={S.centerControls} align="center">
            <Box className={S.controlSection}>
              <Button
                className={S.controlButton}
                fw="bold"
                aria-label={t`No breakout`}
                variant="subtle"
                color="text-primary"
                leftSection={<Icon c="brand" name="unreferenced" size={16} />}
                onClick={openSidebar}
              >
                {t`No breakout`}
              </Button>
            </Box>
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <Box className={S.root} data-testid="metrics-viewer-controls">
      <LeftControls
        chartTypes={chartTypes}
        value={effectiveDisplayType}
        showStackSeries={showStackSeries}
        isStacked={!!visualizationSettings?.["graph.split_panels"]}
        onDisplayTypeChange={handleDisplayTypeChange}
        onStackedChange={(stacked) =>
          handleVisualizationSettingsChange({
            "graph.split_panels": stacked,
          })
        }
      />
      <CenterControls
        definition={definition}
        allFilterDimensions={allFilterDimensions}
        projectionInfo={projectionInfo}
        dimensionFilter={dimensionFilter}
        columnPickerLabel={columnPickerLabel}
        columnPickerIcon={columnPickerIcon}
        hasAvailableDimensions={hasAvailableDimensions}
        hasFilterControls={!!hasFilterControls}
        hasBucketControls={!!hasBucketControls}
        hasBinningControls={!!hasBinningControls}
        canToggleColumnLabels={canToggleColumnLabels}
        showColumnLabels={showColumnLabels}
        onOpenSidebar={openSidebar}
        onDimensionFilterChange={handleDimensionFilterChange}
        onTemporalUnitChange={handleTemporalUnitChange}
        onBinningChange={handleBinningChange}
        onShowColumnLabelsChange={handleShowColumnLabelsChange}
      />
    </Box>
  );
}
