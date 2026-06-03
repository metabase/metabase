import type { ReactNode } from "react";
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
import { ActionIcon, Box, Button, Flex, Icon, Menu, Switch } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit, VisualizationSettings } from "metabase-types/api";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import { ChartLayoutPicker } from "./ChartLayoutPicker";
import { ChartTypePicker } from "./ChartTypePicker";
import { DimensionFilterButton } from "./DimensionFilterButton";
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

function ControlSection({ children }: { children: ReactNode }) {
  return <Box className={S.controlSection}>{children}</Box>;
}

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
      onDimensionBreakoutUpdate({ showColumnLabels });
    },
    [onDimensionBreakoutUpdate],
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
  const showColumnLabels = dimensionBreakout.showColumnLabels === true;

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

  const hasCenterControls =
    hasFilterControls || hasBucketControls || hasBinningControls;

  if (dimensionBreakoutType === "scalar") {
    return (
      <Box className={S.root} data-testid="metrics-viewer-controls">
        <Flex className={S.centerCluster}>
          <Flex className={S.centerControls} align="center">
            <ControlSection>
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
            </ControlSection>
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <Box className={S.root} data-testid="metrics-viewer-controls">
      <Flex className={S.leftControls} align="center" gap="md">
        <ChartTypePicker
          chartTypes={chartTypes}
          value={effectiveDisplayType}
          onChange={handleDisplayTypeChange}
        />
        {showStackSeries && (
          <ChartLayoutPicker
            isStacked={!!visualizationSettings?.["graph.split_panels"]}
            onToggle={(stacked) =>
              handleVisualizationSettingsChange({
                "graph.split_panels": stacked,
              })
            }
          />
        )}
      </Flex>
      {(hasCenterControls || canToggleColumnLabels) && (
        <Box className={S.centerCluster}>
          {hasCenterControls && (
            <Flex className={S.centerControls} align="center">
              {hasFilterControls && projectionInfo.filterDimension && (
                <>
                  {hasAvailableDimensions && (
                    <ControlSection>
                      <Button
                        className={S.controlButton}
                        justify="space-between"
                        fw="bold"
                        aria-label={t`Change column`}
                        variant="subtle"
                        color="text-primary"
                        leftSection={
                          columnPickerIcon ? (
                            <Icon c="brand" name={columnPickerIcon} size={16} />
                          ) : undefined
                        }
                        onClick={openSidebar}
                      >
                        {columnPickerLabel}
                      </Button>
                    </ControlSection>
                  )}
                  <ControlSection>
                    <DimensionFilterButton
                      definition={definition}
                      filterDimension={projectionInfo.filterDimension}
                      dimensionFilter={dimensionFilter}
                      allFilterDimensions={allFilterDimensions}
                      onChange={handleDimensionFilterChange}
                    />
                  </ControlSection>
                </>
              )}
              {hasBucketControls && projectionInfo.projectionDimension && (
                <ControlSection>
                  <BucketButton
                    definition={definition}
                    dimension={projectionInfo.projectionDimension}
                    projection={projectionInfo.projection!}
                    onChange={handleTemporalUnitChange}
                  />
                </ControlSection>
              )}
              {hasBinningControls && projectionInfo.projectionDimension && (
                <ControlSection>
                  <BinningButton
                    definition={definition}
                    dimension={projectionInfo.projectionDimension}
                    projection={projectionInfo.projection!}
                    onBinningChange={handleBinningChange}
                  />
                </ControlSection>
              )}
            </Flex>
          )}
          {canToggleColumnLabels && (
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <ActionIcon
                  className={S.ellipsisMenuButton}
                  aria-label={t`Column label options`}
                  variant="subtle"
                >
                  <Icon name="ellipsis" c="text-primary" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown p="md">
                <Switch
                  label={t`Show column labels`}
                  size="sm"
                  labelPosition="right"
                  checked={showColumnLabels}
                  onChange={(event) =>
                    handleShowColumnLabelsChange(event.currentTarget.checked)
                  }
                />
              </Menu.Dropdown>
            </Menu>
          )}
        </Box>
      )}
    </Box>
  );
}
