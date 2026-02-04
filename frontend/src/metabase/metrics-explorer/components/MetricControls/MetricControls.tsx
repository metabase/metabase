import { useMemo, useState } from "react";
import { t } from "ttag";

import { SimpleDateFilterPicker } from "metabase/querying/filters/components/FilterPicker/DateFilterPicker/SimpleDateFilterPicker";
import {
  findBreakoutClause,
  findFilterClause,
  findFilterColumn,
} from "metabase/querying/filters/components/TimeseriesChrome/utils";
import type { IconName } from "metabase/ui";
import {
  ActionIcon,
  Button,
  Divider,
  Flex,
  Icon,
  Popover,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  DimensionTabType,
  MetricsExplorerDisplayType,
} from "metabase-types/store/metrics-explorer";

import { BinningButton } from "./BinningButton";
import { BucketButton } from "./BucketButton";
import S from "./MetricControls.module.css";

const STAGE_INDEX = -1;

interface ChartTypeOption {
  type: MetricsExplorerDisplayType;
  icon: IconName;
}

const TIME_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
];

const GEO_CHART_TYPES: ChartTypeOption[] = [
  { type: "map", icon: "pinmap" },
];

const CATEGORY_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
  { type: "pie", icon: "pie" },
];

const NUMERIC_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
  { type: "scatter", icon: "bubble" },
];

function getChartTypesForTab(tabType: DimensionTabType | null): ChartTypeOption[] {
  switch (tabType) {
    case "geo":
      return GEO_CHART_TYPES;
    case "numeric":
      return NUMERIC_CHART_TYPES;
    case "category":
    case "boolean":
      return CATEGORY_CHART_TYPES;
    case "time":
    default:
      return TIME_CHART_TYPES;
  }
}

function getDefaultDisplayTypeForTab(
  tabType: DimensionTabType | null,
): MetricsExplorerDisplayType {
  switch (tabType) {
    case "geo":
      return "map";
    case "numeric":
      return "bar";
    case "category":
    case "boolean":
    case "time":
    default:
      return "line";
  }
}

function isValidDisplayTypeForTab(
  displayType: MetricsExplorerDisplayType,
  tabType: DimensionTabType | null,
): boolean {
  const validTypes = getChartTypesForTab(tabType);
  return validTypes.some((t) => t.type === displayType);
}

interface MetricControlsProps {
  question: Question;
  displayType: MetricsExplorerDisplayType;
  tabType: DimensionTabType | null;
  showTimeControls?: boolean;
  onDisplayTypeChange: (displayType: MetricsExplorerDisplayType) => void;
  onQueryChange: (query: Lib.Query) => void;
  onBinningChange?: (binningStrategy: string | null) => void;
}

export function MetricControls({
  question,
  displayType,
  tabType,
  showTimeControls = true,
  onDisplayTypeChange,
  onQueryChange,
  onBinningChange,
}: MetricControlsProps) {
  const query = question.query();
  const breakoutInfo = useBreakoutInfo(query);
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

  const chartTypes = getChartTypesForTab(tabType);
  const effectiveDisplayType = isValidDisplayTypeForTab(displayType, tabType)
    ? displayType
    : getDefaultDisplayTypeForTab(tabType);

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
            onChange={onQueryChange}
          />
        </>
      )}
      {hasBinningControls && query && breakoutInfo.breakoutColumn && onBinningChange && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <BinningControls
            query={query}
            breakoutInfo={breakoutInfo}
            onBinningChange={onBinningChange}
          />
        </>
      )}
    </Flex>
  );
}

export { getDefaultDisplayTypeForTab, isValidDisplayTypeForTab };

interface ChartTypePickerProps {
  chartTypes: ChartTypeOption[];
  value: MetricsExplorerDisplayType;
  onChange: (type: MetricsExplorerDisplayType) => void;
}

function ChartTypePicker({ chartTypes, value, onChange }: ChartTypePickerProps) {
  return (
    <Flex gap="xs">
      {chartTypes.map(({ type, icon }) => (
        <ActionIcon
          key={type}
          variant={value === type ? "filled" : "subtle"}
          color={value === type ? "brand" : "text-primary"}
          onClick={() => onChange(type)}
          aria-label={type}
        >
          <Icon name={icon} />
        </ActionIcon>
      ))}
    </Flex>
  );
}

interface BreakoutInfo {
  breakout: Lib.BreakoutClause | undefined;
  breakoutColumn: Lib.ColumnMetadata | undefined;
  filterColumn: Lib.ColumnMetadata | undefined;
  filter: Lib.FilterClause | undefined;
  isTemporalBucketable: boolean;
  isBinnable: boolean;
  hasBinning: boolean;
}

function useBreakoutInfo(query: Lib.Query): BreakoutInfo {
  return useMemo(() => {
    // Get all breakouts - findBreakoutClause only finds temporal ones
    const allBreakouts = Lib.breakouts(query, STAGE_INDEX);
    const firstBreakout = allBreakouts[0] as Lib.BreakoutClause | undefined;

    // For temporal controls, use the temporal-specific finder
    const temporalBreakout = findBreakoutClause(query, STAGE_INDEX);

    const breakoutColumn = firstBreakout
      ? (Lib.breakoutColumn(query, STAGE_INDEX, firstBreakout) ?? undefined)
      : undefined;
    const isTemporalBucketable = breakoutColumn
      ? Lib.isTemporalBucketable(query, STAGE_INDEX, breakoutColumn)
      : false;
    const isBinnable = breakoutColumn
      ? Lib.isBinnable(query, STAGE_INDEX, breakoutColumn)
      : false;
    const hasBinning = firstBreakout ? Lib.binning(firstBreakout) !== null : false;

    // Filter column only makes sense for temporal breakouts
    const filterColumn = temporalBreakout && breakoutColumn
      ? findFilterColumn(query, STAGE_INDEX, breakoutColumn)
      : undefined;
    const filter = filterColumn
      ? findFilterClause(query, STAGE_INDEX, filterColumn)
      : undefined;

    return {
      breakout: firstBreakout,
      breakoutColumn,
      filterColumn,
      filter,
      isTemporalBucketable,
      isBinnable,
      hasBinning,
    };
  }, [query]);
}

interface TimeseriesControlsProps {
  query: Lib.Query;
  breakoutInfo: BreakoutInfo;
  onChange: (query: Lib.Query) => void;
}

function TimeseriesControls({
  query,
  breakoutInfo,
  onChange,
}: TimeseriesControlsProps) {
  const { breakout, breakoutColumn, filterColumn, filter, isTemporalBucketable } =
    breakoutInfo;

  const handleFilterChange = (newFilter: Lib.ExpressionClause | undefined) => {
    if (filter && newFilter) {
      onChange(Lib.replaceClause(query, STAGE_INDEX, filter, newFilter));
    } else if (newFilter) {
      onChange(Lib.filter(query, STAGE_INDEX, newFilter));
    } else if (filter) {
      onChange(Lib.removeClause(query, STAGE_INDEX, filter));
    }
  };

  const handleBreakoutChange = (newBreakout: Lib.ColumnMetadata) => {
    if (breakout) {
      onChange(Lib.replaceClause(query, STAGE_INDEX, breakout, newBreakout));
    }
  };

  if (!breakout || !breakoutColumn || !filterColumn) {
    return null;
  }

  return (
    <>
      <FilterButton
        query={query}
        column={filterColumn}
        filter={filter}
        onChange={handleFilterChange}
      />
      {isTemporalBucketable && (
        <>
          <Divider orientation="vertical" className={S.divider} />
          <BucketButton
            query={query}
            column={breakoutColumn}
            breakout={breakout}
            onChange={handleBreakoutChange}
          />
        </>
      )}
    </>
  );
}

interface BinningControlsProps {
  query: Lib.Query;
  breakoutInfo: BreakoutInfo;
  onBinningChange: (binningStrategy: string | null) => void;
}

function BinningControls({
  query,
  breakoutInfo,
  onBinningChange,
}: BinningControlsProps) {
  const { breakout, breakoutColumn } = breakoutInfo;

  if (!breakout || !breakoutColumn) {
    return null;
  }

  return (
    <BinningButton
      query={query}
      column={breakoutColumn}
      breakout={breakout}
      onBinningChange={onBinningChange}
    />
  );
}

interface FilterButtonProps {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause | undefined) => void;
}

function FilterButton({ query, column, filter, onChange }: FilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const filterName = useMemo(() => {
    return filter
      ? Lib.filterArgsDisplayName(query, STAGE_INDEX, filter)
      : t`All time`;
  }, [query, filter]);

  const handleChange = (newFilter: Lib.ExpressionClause | undefined) => {
    onChange(newFilter);
    setIsOpen(false);
  };

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          className={S.controlButton}
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {filterName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <SimpleDateFilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          column={column}
          filter={filter}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
