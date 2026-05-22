import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { useDimensionPickerSidebar } from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import type {
  MetricSourceId,
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "metabase/metrics-viewer/types";
import {
  type AvailableDimensionsResult,
  type DimensionFilterValue,
  getDimensionIcon,
  getProjectionInfo,
  getTabConfig,
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
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onDimensionFilterChange: (value: DimensionFilterValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange: (binningStrategy: string | undefined) => void;
  canToggleColumnLabels?: boolean;
  showColumnLabels?: boolean;
  onShowColumnLabelsChange?: (show: boolean) => void;
  showStackSeries?: boolean;
  visualizationSettings?: Partial<VisualizationSettings>;
  onVisualizationSettingsChange?: (
    updates: Partial<VisualizationSettings>,
  ) => void;
};

function ControlSection({ children }: { children: ReactNode }) {
  return <Box className={S.controlSection}>{children}</Box>;
}

export function MetricControls({
  definition,
  displayType,
  tabType,
  tabLabel,
  dimensionFilter,
  allFilterDimensions,
  availableDimensions,
  sourceOrder,
  onDisplayTypeChange,
  onDimensionFilterChange,
  onTemporalUnitChange,
  onBinningChange,
  canToggleColumnLabels,
  showColumnLabels = false,
  onShowColumnLabelsChange,
  showStackSeries,
  visualizationSettings,
  onVisualizationSettingsChange,
}: MetricControlsProps) {
  const { open: openDimensionPickerSidebar } = useDimensionPickerSidebar();
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
  const columnPickerLabel =
    tabType === "time" ? t`Time` : (tabLabel ?? t`Select column`);
  const columnPickerIcon = projectionInfo.projectionDimension
    ? getDimensionIcon(projectionInfo.projectionDimension)
    : undefined;

  const hasCenterControls =
    hasFilterControls || hasBucketControls || hasBinningControls;

  return (
    <Box className={S.root} data-testid="metrics-viewer-controls">
      <Flex className={S.leftControls} align="center" gap="md">
        <ChartTypePicker
          chartTypes={chartTypes}
          value={effectiveDisplayType}
          onChange={onDisplayTypeChange}
        />
        {showStackSeries && onVisualizationSettingsChange && (
          <ChartLayoutPicker
            isStacked={!!visualizationSettings?.["graph.split_panels"]}
            onToggle={(stacked) =>
              onVisualizationSettingsChange({
                "graph.split_panels": stacked,
              })
            }
          />
        )}
      </Flex>
      {(hasCenterControls || canToggleColumnLabels) && (
        <Flex className={S.centerCluster} align="center" gap="sm">
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
                        onClick={openDimensionPickerSidebar}
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
                      onChange={onDimensionFilterChange}
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
                    onChange={onTemporalUnitChange}
                  />
                </ControlSection>
              )}
              {hasBinningControls && projectionInfo.projectionDimension && (
                <ControlSection>
                  <BinningButton
                    definition={definition}
                    dimension={projectionInfo.projectionDimension}
                    projection={projectionInfo.projection!}
                    onBinningChange={onBinningChange}
                  />
                </ControlSection>
              )}
            </Flex>
          )}
          {canToggleColumnLabels && onShowColumnLabelsChange && (
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <ActionIcon
                  className={S.optionsButton}
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
                    onShowColumnLabelsChange(event.currentTarget.checked)
                  }
                />
              </Menu.Dropdown>
            </Menu>
          )}
        </Flex>
      )}
    </Box>
  );
}
