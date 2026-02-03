import { useMemo, useState } from "react";
import { t } from "ttag";

import { SimpleDateFilterPicker } from "metabase/querying/filters/components/FilterPicker/DateFilterPicker/SimpleDateFilterPicker";
import {
  findBreakoutClause,
  findFilterClause,
  findFilterColumn,
} from "metabase/querying/filters/components/TimeseriesChrome/utils";
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
import type { IconName } from "metabase/ui";
import type {
  DimensionTabType,
  MetricsExplorerDisplayType,
} from "metabase-types/store/metrics-explorer";

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

function getChartTypesForTab(tabType: DimensionTabType | null): ChartTypeOption[] {
  switch (tabType) {
    case "geo":
      return GEO_CHART_TYPES;
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
}

export function MetricControls({
  question,
  displayType,
  tabType,
  showTimeControls = true,
  onDisplayTypeChange,
  onQueryChange,
}: MetricControlsProps) {
  const query = question.query();
  const timeseriesInfo = useTimeseriesInfo(query);
  const hasTimeseriesControls =
    showTimeControls && timeseriesInfo.breakout && timeseriesInfo.filterColumn;

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
            timeseriesInfo={timeseriesInfo}
            onChange={onQueryChange}
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

interface TimeseriesInfo {
  breakout: Lib.BreakoutClause | undefined;
  breakoutColumn: Lib.ColumnMetadata | undefined;
  filterColumn: Lib.ColumnMetadata | undefined;
  filter: Lib.FilterClause | undefined;
  isTemporalBucketable: boolean;
}

function useTimeseriesInfo(query: Lib.Query): TimeseriesInfo {
  return useMemo(() => {
    const breakout = findBreakoutClause(query, STAGE_INDEX);
    const breakoutColumn = breakout
      ? (Lib.breakoutColumn(query, STAGE_INDEX, breakout) ?? undefined)
      : undefined;
    const isTemporalBucketable = breakoutColumn
      ? Lib.isTemporalBucketable(query, STAGE_INDEX, breakoutColumn)
      : false;
    const filterColumn = breakoutColumn
      ? findFilterColumn(query, STAGE_INDEX, breakoutColumn)
      : undefined;
    const filter = filterColumn
      ? findFilterClause(query, STAGE_INDEX, filterColumn)
      : undefined;

    return { breakout, breakoutColumn, filterColumn, filter, isTemporalBucketable };
  }, [query]);
}

interface TimeseriesControlsProps {
  query: Lib.Query;
  timeseriesInfo: TimeseriesInfo;
  onChange: (query: Lib.Query) => void;
}

function TimeseriesControls({
  query,
  timeseriesInfo,
  onChange,
}: TimeseriesControlsProps) {
  const { breakout, breakoutColumn, filterColumn, filter, isTemporalBucketable } =
    timeseriesInfo;

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
