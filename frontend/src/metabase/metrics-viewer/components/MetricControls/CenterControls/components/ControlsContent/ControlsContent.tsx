import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type {
  MetricsViewerDimensionBreakoutProjectionConfig,
  MetricsViewerDimensionBreakoutState,
} from "metabase/metrics-viewer/types";
import {
  type DimensionFilterValue,
  getDimensionIcon,
  getProjectionInfo,
} from "metabase/metrics-viewer/utils";
import { Box, Button, Flex, Icon } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import S from "../../CenterControls.module.css";
import { useProjectionControlsVisibility } from "../../hooks/useProjectionControlsVisibility";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import { ColumnLabelOptions } from "./ColumnLabelOptions";
import { DimensionFilterButton } from "./DimensionFilterButton";

type ControlsContentProps = {
  definition: MetricDefinition;
  allFilterDimensions?: DimensionMetadata[];
  canToggleColumnLabels?: boolean;
  dimensionBreakout: MetricsViewerDimensionBreakoutState;
  setIsXAxisPopoverOpen: (opened: boolean) => void;
  variant: "inline" | "floating";
};

export function ControlsContent(props: ControlsContentProps) {
  const {
    allFilterDimensions,
    canToggleColumnLabels,
    definition,
    dimensionBreakout,
    setIsXAxisPopoverOpen,
    variant,
  } = props;
  const {
    availableDimensions,
    sourceOrder,
    openSidebar,
    updateActiveDimensionBreakout,
  } = useMetricsViewerContext();
  const projectionInfo = useMemo(
    () => getProjectionInfo(definition),
    [definition],
  );

  const hasSharedDimensions = availableDimensions.shared.length > 0;
  const hasAnySourceDimensions = sourceOrder.some(
    (sourceId) => (availableDimensions.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableDimensions = hasSharedDimensions || hasAnySourceDimensions;
  const columnPickerLabel =
    dimensionBreakout.type === "time"
      ? t`Time`
      : (dimensionBreakout.label ?? t`Select column`);
  const columnPickerIcon = projectionInfo.projectionDimension
    ? getDimensionIcon(projectionInfo.projectionDimension)
    : undefined;
  const dimensionFilter = dimensionBreakout.projectionConfig.dimensionFilter;
  const {
    hasBinningControls,
    hasBucketControls,
    hasCenterControls,
    hasFilterControls,
  } = useProjectionControlsVisibility(projectionInfo);

  const handleOpenSidebar = () => {
    setIsXAxisPopoverOpen(false);
    openSidebar();
  };

  const updateProjectionConfig = useCallback(
    (updates: Partial<MetricsViewerDimensionBreakoutProjectionConfig>) => {
      updateActiveDimensionBreakout({
        projectionConfig: {
          ...dimensionBreakout?.projectionConfig,
          ...updates,
        },
      });
    },
    [updateActiveDimensionBreakout, dimensionBreakout?.projectionConfig],
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

  return (
    <Box className={S.centerControlsContent}>
      {hasCenterControls && (
        <Flex className={S.centerControls} align="center">
          {hasFilterControls && projectionInfo.filterDimension && (
            <>
              {hasAvailableDimensions && (
                <Box className={S.controlSection}>
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
                    onClick={handleOpenSidebar}
                  >
                    {columnPickerLabel}
                  </Button>
                </Box>
              )}
              <Box className={S.controlSection}>
                <DimensionFilterButton
                  definition={definition}
                  filterDimension={projectionInfo.filterDimension}
                  dimensionFilter={dimensionFilter}
                  allFilterDimensions={allFilterDimensions}
                  onChange={handleDimensionFilterChange}
                />
              </Box>
            </>
          )}
          {hasBucketControls && projectionInfo.projectionDimension && (
            <Box className={S.controlSection}>
              <BucketButton
                definition={definition}
                dimension={projectionInfo.projectionDimension}
                projection={projectionInfo.projection!}
                onChange={handleTemporalUnitChange}
              />
            </Box>
          )}
          {hasBinningControls && projectionInfo.projectionDimension && (
            <Box className={S.controlSection}>
              <BinningButton
                definition={definition}
                dimension={projectionInfo.projectionDimension}
                projection={projectionInfo.projection!}
                onBinningChange={handleBinningChange}
              />
            </Box>
          )}
        </Flex>
      )}
      {canToggleColumnLabels && <ColumnLabelOptions variant={variant} />}
    </Box>
  );
}
