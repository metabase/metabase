import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  Box,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { getColorsForValues } from "metabase/ui/colors/charts";
import * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import type { FilterCanvasProps } from "../../types";

import S from "./ChartFilters.module.css";
import type { AxisTitleFrame, LegendFrame } from "./QuestionChart";

const OPERATOR_SYMBOLS: Record<string, string> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
};

/**
 * The chart's legend as pills: one per measure. Clicking one filters the
 * summary on it, and a filtered measure reads "Count ≥ 3".
 */
export function LegendFilters({
  query,
  onChange,
  isFilteredOnly,
}: FilterCanvasProps & {
  /** Only the measures with a condition: a legend the app wouldn't show, kept for the conditions. */
  isFilteredOnly?: boolean;
}) {
  const summaryQuery = toSummaryQuery(query);
  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  const measures = getMeasures(summaryQuery).filter(
    (measure) =>
      !isFilteredOnly || getMeasureFilters(summaryQuery, measure).length > 0,
  );
  if (measures.length === 0) {
    return null;
  }
  // same keys and hashing the chart uses for its series colors
  const names = measures.map(
    (measure) =>
      Lib.displayInfo(summaryQuery, getSummaryStage(summaryQuery), measure)
        .name,
  );
  const colors = getColorsForValues(names, null, undefined, names);

  return (
    <Group gap={4} mb="sm" wrap="nowrap" className={S.legendFilters}>
      {measures.map((measure, index) => (
        <LegendPill
          key={index}
          summaryQuery={summaryQuery}
          measure={measure}
          seriesColor={colors[names[index]]}
          onChange={handleChange}
        />
      ))}
    </Group>
  );
}

type AxisTitleFilterProps = FilterCanvasProps & { frame: AxisTitleFrame };

/**
 * A y-axis title as the pill for the measure it names, legend or not. It
 * never reads the condition: that's in the legend.
 */
export function AxisTitleFilter({
  query,
  onChange,
  frame,
}: AxisTitleFilterProps) {
  const summaryQuery = toSummaryQuery(query);
  const measure = getMeasures(summaryQuery).find(
    (measure) =>
      Lib.displayInfo(summaryQuery, getSummaryStage(summaryQuery), measure)
        .displayName === frame.text,
  );
  if (!measure) {
    return null;
  }
  return (
    <LegendPill
      summaryQuery={summaryQuery}
      measure={measure}
      fontSize={frame.fontSize}
      isVertical
      onChange={(nextQuery) => onChange(Lib.dropEmptyStages(nextQuery))}
    />
  );
}

type LegendPillProps = {
  summaryQuery: Lib.Query;
  measure: Lib.ColumnMetadata;
  /** No dot without one, as on the axis. */
  seriesColor?: string;
  /** Reads bottom to top, like an axis title. */
  isVertical?: boolean;
  fontSize?: string;
  onChange: (query: Lib.Query) => void;
};

function LegendPill({
  summaryQuery,
  measure,
  seriesColor,
  isVertical,
  fontSize,
  onChange,
}: LegendPillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const measureInfo = Lib.displayInfo(
    summaryQuery,
    getSummaryStage(summaryQuery),
    measure,
  );
  const filters = getMeasureFilters(summaryQuery, measure);
  const isFiltered = filters.length > 0;
  const condition = describeConditions(summaryQuery, filters);

  return (
    <Popover
      opened={isOpened}
      position={isVertical ? "right-start" : "bottom-start"}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Box>
          <Tooltip
            label={t`Click to filter`}
            disabled={isOpened}
            position={isVertical ? "right" : "top"}
          >
            <UnstyledButton
              className={cx(S.legendPill, isVertical && S.legendPillVertical)}
              data-active={isOpened || undefined}
              onClick={() => setIsOpened(!isOpened)}
            >
              {seriesColor && (
                <Box
                  className={S.legendDot}
                  style={{ backgroundColor: seriesColor }}
                />
              )}
              <Group gap={4} wrap="nowrap" className={S.legendLabel}>
                <Text size="xs" fz={fontSize} fw="bold" c="inherit">
                  {measureInfo.displayName}
                </Text>
                {condition && !isVertical && (
                  <Text size="xs" fz={fontSize} c="inherit">
                    {condition}
                  </Text>
                )}
              </Group>
              {isFiltered && !isVertical && (
                <Icon
                  name="close"
                  size={10}
                  className={cx(S.thresholdRemove, S.legendRemove)}
                  aria-label={t`Remove`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(removeFilters(summaryQuery, filters));
                  }}
                />
              )}
            </UnstyledButton>
          </Tooltip>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <MeasureFilterPicker
          summaryQuery={summaryQuery}
          measure={measure}
          onChange={(nextQuery) => {
            onChange(nextQuery);
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type LegendFilterWrapProps = FilterCanvasProps & { frame: LegendFrame };

/**
 * A legend of series (one per category) as a single pill: clicking anywhere
 * on it filters the summary, and only once filtered does it lead with
 * "Count ≥ 3". The series keep their own hover.
 */
export function LegendFilterWrap({
  query,
  onChange,
  frame,
}: LegendFilterWrapProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [isLeadHovered, setIsLeadHovered] = useState(false);
  const [measure, setMeasure] = useState<Lib.ColumnMetadata>();
  const summaryQuery = toSummaryQuery(query);
  const measures = getMeasures(summaryQuery);
  const pickedMeasure =
    measure ?? (measures.length === 1 ? measures[0] : undefined);
  const filtered = measures
    .map((measure) => ({
      measure,
      filters: getMeasureFilters(summaryQuery, measure),
    }))
    .filter(({ filters }) => filters.length > 0);
  const isHighlighted = isRowHovered || isLeadHovered || isOpened;
  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));
  const close = () => {
    setIsOpened(false);
    setMeasure(undefined);
  };

  useEffect(() => {
    const { row } = frame;
    const enter = () => setIsRowHovered(true);
    const leave = () => setIsRowHovered(false);
    // Caught on the way down, so a click on a series filters instead of
    // reaching the legend item.
    const click = (event: MouseEvent) => {
      event.stopPropagation();
      setIsOpened(true);
    };
    row.style.cursor = "pointer";
    row.addEventListener("mouseenter", enter);
    row.addEventListener("mouseleave", leave);
    row.addEventListener("click", click, true);
    return () => {
      row.removeEventListener("mouseenter", enter);
      row.removeEventListener("mouseleave", leave);
      row.removeEventListener("click", click, true);
    };
  }, [frame]);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      onChange={(opened) => (opened ? setIsOpened(true) : close())}
    >
      <Popover.Target>
        <Box>
          <Tooltip
            label={t`Click to filter`}
            opened={(isRowHovered || isLeadHovered) && !isOpened}
          >
            <Box
              className={S.legendWrap}
              data-active={isHighlighted || undefined}
              w={frame.width}
            >
              {filtered.length > 0 && (
                <Group
                  data-legend-lead
                  gap="sm"
                  wrap="nowrap"
                  className={S.legendLead}
                  onMouseEnter={() => setIsLeadHovered(true)}
                  onMouseLeave={() => setIsLeadHovered(false)}
                  onClick={() => setIsOpened(true)}
                >
                  {filtered.map(({ measure, filters }, index) => (
                    <Group
                      key={index}
                      gap={4}
                      wrap="nowrap"
                      className={S.legendLabel}
                    >
                      <Text size="xs" fw="bold" c="inherit">
                        {
                          Lib.displayInfo(
                            summaryQuery,
                            getSummaryStage(summaryQuery),
                            measure,
                          ).displayName
                        }
                      </Text>
                      <Text size="xs" c="inherit">
                        {describeConditions(summaryQuery, filters)}
                      </Text>
                    </Group>
                  ))}
                  <Icon
                    name="close"
                    size={10}
                    className={cx(S.thresholdRemove, S.legendRemove)}
                    aria-label={t`Remove`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleChange(
                        removeFilters(
                          summaryQuery,
                          filtered.flatMap(({ filters }) => filters),
                        ),
                      );
                    }}
                  />
                </Group>
              )}
            </Box>
          </Tooltip>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        {pickedMeasure && !measure && (
          // The series legend doesn't name the measure, so the popover does.
          <Text fw="bold" px="lg" pt="lg">
            {
              Lib.displayInfo(
                summaryQuery,
                getSummaryStage(summaryQuery),
                pickedMeasure,
              ).displayName
            }
          </Text>
        )}
        {pickedMeasure ? (
          <MeasureFilterPicker
            summaryQuery={summaryQuery}
            measure={pickedMeasure}
            onBack={measure ? () => setMeasure(undefined) : undefined}
            onChange={(nextQuery) => {
              handleChange(nextQuery);
              close();
            }}
          />
        ) : (
          <Stack gap={0} p="sm" miw={200}>
            {measures.map((measure, index) => (
              <UnstyledButton
                key={index}
                className={S.legendMeasureOption}
                onClick={() => setMeasure(measure)}
              >
                <Text size="sm" c="inherit">
                  {
                    Lib.displayInfo(
                      summaryQuery,
                      getSummaryStage(summaryQuery),
                      measure,
                    ).displayName
                  }
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

type MeasureFilterPickerProps = {
  summaryQuery: Lib.Query;
  measure: Lib.ColumnMetadata;
  onBack?: () => void;
  onChange: (query: Lib.Query) => void;
};

/** The app's number filter for one measure: edits its filter, or adds one. */
function MeasureFilterPicker({
  summaryQuery,
  measure,
  onBack,
  onChange,
}: MeasureFilterPickerProps) {
  const filter = getMeasureFilters(summaryQuery, measure)[0];

  return (
    <FilterPickerBody
      query={summaryQuery}
      stageIndex={getSummaryStage(summaryQuery)}
      column={measure}
      filter={filter}
      isNew={!filter}
      onBack={onBack}
      onChange={(clause) => {
        const nextClause = toFilterClause(
          summaryQuery,
          getSummaryStage(summaryQuery),
          clause,
        );
        onChange(
          filter
            ? Lib.replaceClause(
                summaryQuery,
                getSummaryStage(summaryQuery),
                filter,
                nextClause,
              )
            : Lib.filter(
                summaryQuery,
                getSummaryStage(summaryQuery),
                nextClause,
              ),
        );
      }}
    />
  );
}

function getMeasureFilters(
  summaryQuery: Lib.Query,
  measure: Lib.ColumnMetadata,
): Lib.FilterClause[] {
  const measureName = Lib.displayInfo(
    summaryQuery,
    getSummaryStage(summaryQuery),
    measure,
  ).name;
  return Lib.filters(summaryQuery, getSummaryStage(summaryQuery)).filter(
    (filter) => {
      const column = Lib.numberFilterParts(
        summaryQuery,
        getSummaryStage(summaryQuery),
        filter,
      )?.column;
      return (
        column != null &&
        Lib.displayInfo(summaryQuery, getSummaryStage(summaryQuery), column)
          .name === measureName
      );
    },
  );
}

function removeFilters(
  summaryQuery: Lib.Query,
  filters: Lib.FilterClause[],
): Lib.Query {
  return filters.reduce(
    (query, filter) =>
      Lib.removeClause(query, getSummaryStage(summaryQuery), filter),
    summaryQuery,
  );
}

function describeConditions(
  summaryQuery: Lib.Query,
  filters: Lib.FilterClause[],
) {
  return filters
    .map((filter) => describeCondition(summaryQuery, filter))
    .join(", ");
}

/** "≥ 3", "between 3 and 10": the condition without the measure's name. */
function describeCondition(summaryQuery: Lib.Query, filter: Lib.FilterClause) {
  const parts = Lib.numberFilterParts(
    summaryQuery,
    getSummaryStage(summaryQuery),
    filter,
  );
  if (!parts) {
    return "";
  }
  const values = parts.values.map((value) => value.toLocaleString());
  switch (parts.operator) {
    case "between":
      return t`between ${values[0]} and ${values[1]}`;
    case "is-null":
      return t`is empty`;
    case "not-null":
      return t`is not empty`;
    default:
      return `${OPERATOR_SYMBOLS[parts.operator]} ${values.join(", ")}`;
  }
}

function getMeasures(summaryQuery: Lib.Query): Lib.ColumnMetadata[] {
  const rowsStage = getRowsStage(summaryQuery);
  const aggregationNames = new Set(
    Lib.returnedColumns(summaryQuery, rowsStage)
      .map((column) => Lib.displayInfo(summaryQuery, rowsStage, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  return Lib.filterableColumns(
    summaryQuery,
    getSummaryStage(summaryQuery),
  ).filter((column) =>
    aggregationNames.has(
      Lib.displayInfo(summaryQuery, getSummaryStage(summaryQuery), column).name,
    ),
  );
}

/**
 * The chart plots the last summary, so the legend filters the stage after
 * it: with two summaries, that's the second one's measures.
 */
function getRowsStage(query: Lib.Query): number {
  const stages = Array.from({ length: Lib.stageCount(query) }, (_, i) => i);
  const aggregating = stages.filter(
    (stage) => Lib.aggregations(query, stage).length > 0,
  );
  return aggregating.at(-1) ?? 0;
}

function getSummaryStage(summaryQuery: Lib.Query): number {
  return getRowsStage(summaryQuery) + 1;
}

function toSummaryQuery(query: Lib.Query): Lib.Query {
  return Lib.stageCount(query) > getSummaryStage(query)
    ? query
    : Lib.appendStage(query);
}
