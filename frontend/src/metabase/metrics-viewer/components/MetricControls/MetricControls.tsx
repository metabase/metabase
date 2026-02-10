import { useMemo } from "react";

import type { DatePickerValue } from "metabase/querying/common/types";
import { Divider, Flex } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../../types/viewer-state";
import { getProjectionInfo } from "../../utils/queries";
import { getTabConfig } from "../../utils/tab-config";

import { BinningButton } from "./BinningButton";
import { ChartTypePicker } from "./ChartTypePicker";
import S from "./MetricControls.module.css";
import { TimeseriesControls } from "./TimeseriesControls";

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
  showTimeControls?: boolean;
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onFilterChange: (value: DatePickerValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange?: (binningStrategy: string | null) => void;
};

export function MetricControls({
  definition,
  displayType,
  tabType,
  showTimeControls = true,
  onDisplayTypeChange,
  onFilterChange,
  onTemporalUnitChange,
  onBinningChange,
}: MetricControlsProps) {
  const projectionInfo = useMemo(() => getProjectionInfo(definition), [definition]);
  const hasTimeseriesControls =
    showTimeControls &&
    projectionInfo.projection &&
    projectionInfo.filterDimension &&
    projectionInfo.isTemporalBucketable;
  const hasBinningControls =
    !hasTimeseriesControls &&
    projectionInfo.projection &&
    projectionInfo.projectionDimension &&
    (projectionInfo.isBinnable || projectionInfo.hasBinning);

  const config = getTabConfig(tabType);
  const chartTypes = config.availableDisplayTypes;
  const effectiveDisplayType = isValidDisplayTypeForTab(displayType, tabType)
    ? displayType
    : config.defaultDisplayType;

  return (
    <Flex className={S.container} align="center" gap="xs">
      <ChartTypePicker
        chartTypes={chartTypes}
        value={effectiveDisplayType}
        onChange={onDisplayTypeChange}
      />
      {hasTimeseriesControls && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <TimeseriesControls
            definition={definition}
            projectionInfo={projectionInfo}
            onFilterChange={onFilterChange}
            onTemporalUnitChange={onTemporalUnitChange}
          />
        </>
      )}
      {hasBinningControls &&
        projectionInfo.projectionDimension &&
        onBinningChange && (
          <>
            <Divider orientation="vertical" className={S.divider} />
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
