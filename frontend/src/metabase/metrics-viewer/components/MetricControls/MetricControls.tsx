import { useMemo } from "react";

import type { DatePickerValue } from "metabase/querying/common/types";
import { Divider, Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../../types/viewer-state";
import { getBreakoutInfo } from "../../utils/queries";
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
  query: Lib.Query;
  displayType: MetricsViewerDisplayType;
  tabType: MetricsViewerTabType;
  showTimeControls?: boolean;
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onFilterChange: (value: DatePickerValue | undefined) => void;
  onTemporalUnitChange: (unit: TemporalUnit | undefined) => void;
  onBinningChange?: (binningStrategy: string | null) => void;
};

export function MetricControls({
  query,
  displayType,
  tabType,
  showTimeControls = true,
  onDisplayTypeChange,
  onFilterChange,
  onTemporalUnitChange,
  onBinningChange,
}: MetricControlsProps) {
  const breakoutInfo = useMemo(() => getBreakoutInfo(query), [query]);
  const hasTimeseriesControls =
    showTimeControls &&
    breakoutInfo.breakout &&
    breakoutInfo.filterColumn &&
    breakoutInfo.isTemporalBucketable;
  const hasBinningControls =
    !hasTimeseriesControls &&
    breakoutInfo.breakout &&
    breakoutInfo.breakoutColumn &&
    (breakoutInfo.isBinnable || breakoutInfo.hasBinning);

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
      {hasTimeseriesControls && query && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <TimeseriesControls
            query={query}
            breakoutInfo={breakoutInfo}
            onFilterChange={onFilterChange}
            onTemporalUnitChange={onTemporalUnitChange}
          />
        </>
      )}
      {hasBinningControls &&
        query &&
        breakoutInfo.breakoutColumn &&
        onBinningChange && (
          <>
            <Divider orientation="vertical" className={S.divider} />
            <BinningButton
              query={query}
              column={breakoutInfo.breakoutColumn}
              breakout={breakoutInfo.breakout!}
              onBinningChange={onBinningChange}
            />
          </>
        )}
    </Flex>
  );
}

export { isValidDisplayTypeForTab };
