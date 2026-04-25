import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { QueryExplorerBar } from "metabase/metrics-viewer/components/QueryExplorerBar";
import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
import {
  Box,
  Button,
  DefaultSelectItem,
  Flex,
  Icon,
  Popover,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

const CHART_TYPES = [
  { type: "line" as const, icon: "line" as const },
  { type: "bar" as const, icon: "bar" as const },
  { type: "area" as const, icon: "area" as const },
];

const TABLE_CHART_TYPE = { type: "table" as const, icon: "table2" as const };

type McpChartType = "line" | "bar" | "area" | "table";

const isMcpChartType = (type: string): type is McpChartType =>
  [...CHART_TYPES, TABLE_CHART_TYPE].some((c) => c.type === type);

export function McpQueryBar() {
  const { question, updateQuestion, queryResults } = useSdkQuestionContext();
  const [isBucketOpen, setIsBucketOpen] = useState(false);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);

  // Recompute whenever results change (unlike useSensibleVisualizations which
  // locks to the initial result via useRef).
  const { sensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: queryResults?.[0] ?? null }),
    [queryResults],
  );

  const rowCount = queryResults?.[0]?.data?.rows?.length ?? 0;

  // Hide the bar entirely when results haven't loaded yet, or when none of
  // line/bar/area are sensible for this query shape.
  const sensibleChartTypes = [
    ...CHART_TYPES.filter(({ type }) => sensibleVisualizations.includes(type)),
    ...(rowCount >= 2 ? [TABLE_CHART_TYPE] : []),
  ];

  const hasOnlyTable =
    sensibleChartTypes.length === 1 && sensibleChartTypes[0].type === "table";

  if (
    !question ||
    !queryResults ||
    sensibleChartTypes.length === 0 ||
    hasOnlyTable
  ) {
    return null;
  }

  const query = question.query();
  const stageIndex = -1;

  // --- Chart type ---

  const rawDisplay = question.display();

  const selectedChartType: McpChartType | null = isMcpChartType(rawDisplay)
    ? rawDisplay
    : null;

  const handleDisplayChange = (type: string) => {
    updateQuestion(question.setDisplay(type as McpChartType).lockDisplay(), {
      run: false,
    });
  };

  // --- Temporal breakout ---
  const breakoutClauses = Lib.breakouts(query, stageIndex);
  let temporalClause: Lib.BreakoutClause | null = null;
  let temporalColumn: Lib.ColumnMetadata | null = null;

  for (const clause of breakoutClauses) {
    const column = Lib.breakoutColumn(query, stageIndex, clause);

    if (column && Lib.isTemporalBucketable(query, stageIndex, column)) {
      temporalClause = clause;
      temporalColumn = column;
      break;
    }
  }

  // Strip the temporal bucket from the column — date filters operate on the
  // raw date column, not the bucketed version used in the breakout.
  const rawTemporalColumn = temporalColumn
    ? Lib.withTemporalBucket(temporalColumn, null)
    : null;

  const currentBucket = temporalColumn
    ? Lib.temporalBucket(temporalColumn)
    : null;

  const currentUnit = currentBucket
    ? (Lib.displayInfo(query, stageIndex, currentBucket)
        .shortName as TemporalUnit)
    : undefined;

  const availableBuckets = temporalColumn
    ? Lib.availableTemporalBuckets(query, stageIndex, temporalColumn)
    : [];

  const availableItems = availableBuckets.map((bucket) => {
    const info = Lib.displayInfo(query, stageIndex, bucket);
    const unit = info.shortName as TemporalUnit;

    return { bucket, unit, label: Lib.describeTemporalUnit(unit) };
  });

  const handleBucketChange = (bucket: Lib.Bucket | null) => {
    if (!temporalClause || !temporalColumn) {
      return;
    }

    const newColumn = Lib.withTemporalBucket(temporalColumn, bucket);

    const newQuery = Lib.replaceClause(
      query,
      stageIndex,
      temporalClause,
      newColumn,
    );

    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsBucketOpen(false);
  };

  const bucketLabel = currentUnit
    ? t`by ${Lib.describeTemporalUnit(currentUnit).toLowerCase()}`
    : t`All time`;

  // --- Date range filter ---
  // Find the first date filter in the current query (the one we manage).
  const allFilters = Lib.filters(query, stageIndex);

  let dateFilterClause: Lib.FilterClause | null = null;
  let dateFilterValue: DatePickerValue | undefined = undefined;

  for (const f of allFilters) {
    const value = getDatePickerValue(query, stageIndex, f);

    if (value != null) {
      dateFilterClause = f;
      dateFilterValue = value;

      break;
    }
  }

  const dateFilterLabel = dateFilterValue
    ? getDateFilterDisplayName(dateFilterValue)
    : t`All time`;

  const datePickerUnits = rawTemporalColumn
    ? getDatePickerUnits(query, stageIndex, rawTemporalColumn)
    : [];

  const handleDateFilterChange = (value: DatePickerValue) => {
    if (!rawTemporalColumn) {
      return;
    }

    const newFilterClause = getDateFilterClause(rawTemporalColumn, value);

    const newQuery = dateFilterClause
      ? Lib.replaceClause(query, stageIndex, dateFilterClause, newFilterClause)
      : Lib.filter(query, stageIndex, newFilterClause);

    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsDateFilterOpen(false);
  };

  const handleDateFilterClear = () => {
    if (!dateFilterClause) {
      return;
    }

    const newQuery = Lib.removeClause(query, stageIndex, dateFilterClause);

    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsDateFilterOpen(false);
  };

  const filterControl = rawTemporalColumn ? (
    <Popover opened={isDateFilterOpen} onChange={setIsDateFilterOpen}>
      <Popover.Target>
        <Button
          w={160}
          justify="space-between"
          fw="bold"
          py="xs"
          px="sm"
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
        >
          {dateFilterLabel}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <DatePicker
          value={dateFilterValue}
          availableUnits={datePickerUnits}
          onChange={handleDateFilterChange}
          renderSubmitButton={({ value }) => (
            <Flex justify="space-between" w="100%">
              {dateFilterClause ? (
                <Button
                  variant="subtle"
                  c="text-secondary"
                  onClick={handleDateFilterClear}
                >
                  {t`All time`}
                </Button>
              ) : (
                <div />
              )}

              <Button
                type="submit"
                variant="filled"
                disabled={!value}
              >{t`Apply`}</Button>
            </Flex>
          )}
        />
      </Popover.Dropdown>
    </Popover>
  ) : undefined;

  const granularityControl =
    temporalColumn && availableItems.length > 0 ? (
      <Popover opened={isBucketOpen} onChange={setIsBucketOpen}>
        <Popover.Target>
          <Button
            w={120}
            justify="space-between"
            fw="bold"
            py="xs"
            px="sm"
            variant="subtle"
            color="text-primary"
            rightSection={<Icon name="chevrondown" size={12} />}
            onClick={() => setIsBucketOpen(!isBucketOpen)}
          >
            {bucketLabel}
          </Button>
        </Popover.Target>

        <Popover.Dropdown>
          <Box p="sm" miw={180}>
            <DefaultSelectItem
              value="none"
              label={t`All time`}
              selected={!currentUnit}
              onClick={() => handleBucketChange(null)}
              role="option"
            />
            {availableItems.map(({ bucket, unit, label }) => (
              <DefaultSelectItem
                key={unit}
                value={unit}
                label={label}
                selected={currentUnit === unit}
                onClick={() => handleBucketChange(bucket)}
                role="option"
              />
            ))}
          </Box>
        </Popover.Dropdown>
      </Popover>
    ) : undefined;

  return (
    <QueryExplorerBar
      chartTypes={sensibleChartTypes}
      currentChartType={selectedChartType ?? ""}
      onChartTypeChange={handleDisplayChange}
      filterControl={filterControl}
      granularityControl={granularityControl}
    />
  );
}
