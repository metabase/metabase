import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import type {
  DimensionFilterValue,
  getProjectionInfo,
} from "metabase/metrics-viewer/utils";
import { Box, Button, Flex, Icon, Popover } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type { IconName, TemporalUnit } from "metabase-types/api";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import { ColumnLabelOptions } from "./ColumnLabelOptions";
import { DimensionFilterButton } from "./DimensionFilterButton";
import S from "./MetricControls.module.css";

type ProjectionInfo = ReturnType<typeof getProjectionInfo>;

type CenterControlsProps = {
  definition: MetricDefinition;
  allFilterDimensions?: DimensionMetadata[];
  projectionInfo: ProjectionInfo;
  dimensionFilter: DimensionFilterValue | undefined;
  columnPickerLabel: string;
  columnPickerIcon?: IconName;
  hasAvailableDimensions: boolean;
  hasFilterControls: boolean;
  hasBucketControls: boolean;
  hasBinningControls: boolean;
  canToggleColumnLabels?: boolean;
  showColumnLabels: boolean;
  onOpenSidebar: () => void;
  onDimensionFilterChange: (value: DimensionFilterValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange: (binningStrategy: string | undefined) => void;
  onShowColumnLabelsChange: (showColumnLabels: boolean) => void;
};

function ControlSection({ children }: { children: ReactNode }) {
  return <Box className={S.controlSection}>{children}</Box>;
}

export function CenterControls({
  definition,
  allFilterDimensions,
  projectionInfo,
  dimensionFilter,
  columnPickerLabel,
  columnPickerIcon,
  hasAvailableDimensions,
  hasFilterControls,
  hasBucketControls,
  hasBinningControls,
  canToggleColumnLabels,
  showColumnLabels,
  onOpenSidebar,
  onDimensionFilterChange,
  onTemporalUnitChange,
  onBinningChange,
  onShowColumnLabelsChange,
}: CenterControlsProps) {
  const [isXAxisPopoverOpen, setIsXAxisPopoverOpen] = useState(false);
  const hasCenterControls =
    hasFilterControls || hasBucketControls || hasBinningControls;

  const handleOpenSidebar = () => {
    setIsXAxisPopoverOpen(false);
    onOpenSidebar();
  };

  const renderControls = (variant: "floating" | "inline") => (
    <Box className={S.centerControlsContent}>
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
                    onClick={handleOpenSidebar}
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
      {canToggleColumnLabels && (
        <ColumnLabelOptions
          showColumnLabels={showColumnLabels}
          onChange={onShowColumnLabelsChange}
          variant={variant}
        />
      )}
    </Box>
  );

  if (!hasCenterControls && !canToggleColumnLabels) {
    return null;
  }

  return (
    <>
      <Box className={S.centerCluster}>{renderControls("floating")}</Box>
      <Box className={S.compactCenterControls}>
        <Popover
          opened={isXAxisPopoverOpen}
          onChange={setIsXAxisPopoverOpen}
          position="top"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <Button
              className={S.xAxisButton}
              aria-label={t`X-axis controls`}
              variant="subtle"
              color="text-primary"
              leftSection={<Icon name="gear" size={16} />}
              onClick={() => setIsXAxisPopoverOpen(!isXAxisPopoverOpen)}
              data-testid="metrics-viewer-x-axis-controls"
            >
              {t`X-axis`}
            </Button>
          </Popover.Target>
          <Popover.Dropdown
            className={S.centerControlsPopoverDropdown}
            p="md"
            bg="background-primary"
          >
            {renderControls("inline")}
          </Popover.Dropdown>
        </Popover>
      </Box>
    </>
  );
}
