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
import type { LegendFrame } from "./QuestionChart";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;

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
export function LegendFilters({ query, onChange }: FilterCanvasProps) {
  const summaryQuery =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  const measures = getMeasures(summaryQuery);
  // same keys and hashing the chart uses for its series colors
  const names = measures.map(
    (measure) => Lib.displayInfo(summaryQuery, SUMMARY_STAGE, measure).name,
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

type LegendPillProps = {
  summaryQuery: Lib.Query;
  measure: Lib.ColumnMetadata;
  seriesColor: string;
  onChange: (query: Lib.Query) => void;
};

function LegendPill({
  summaryQuery,
  measure,
  seriesColor,
  onChange,
}: LegendPillProps) {
  const [isOpened, setIsOpened] = useState(false);
  const measureInfo = Lib.displayInfo(summaryQuery, SUMMARY_STAGE, measure);
  const filters = getMeasureFilters(summaryQuery, measure);
  const filter = filters[0];
  const condition = describeConditions(summaryQuery, filters);

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <Box>
          <Tooltip label={t`Click to filter`} disabled={isOpened}>
            <UnstyledButton
              className={S.legendPill}
              data-active={isOpened || undefined}
              onClick={() => setIsOpened(!isOpened)}
            >
              <Box
                className={S.legendDot}
                style={{ backgroundColor: seriesColor }}
              />
              <Group gap={4} wrap="nowrap" className={S.legendLabel}>
                <Text size="xs" fw="bold" c="inherit">
                  {measureInfo.displayName}
                </Text>
                {condition && (
                  <Text size="xs" c="inherit">
                    {condition}
                  </Text>
                )}
              </Group>
              {filter && (
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
  const summaryQuery =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
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
                          Lib.displayInfo(summaryQuery, SUMMARY_STAGE, measure)
                            .displayName
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
              Lib.displayInfo(summaryQuery, SUMMARY_STAGE, pickedMeasure)
                .displayName
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
                    Lib.displayInfo(summaryQuery, SUMMARY_STAGE, measure)
                      .displayName
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
      stageIndex={SUMMARY_STAGE}
      column={measure}
      filter={filter}
      isNew={!filter}
      onBack={onBack}
      onChange={(clause) => {
        const nextClause = toFilterClause(summaryQuery, SUMMARY_STAGE, clause);
        onChange(
          filter
            ? Lib.replaceClause(summaryQuery, SUMMARY_STAGE, filter, nextClause)
            : Lib.filter(summaryQuery, SUMMARY_STAGE, nextClause),
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
    SUMMARY_STAGE,
    measure,
  ).name;
  return Lib.filters(summaryQuery, SUMMARY_STAGE).filter((filter) => {
    const column = Lib.numberFilterParts(
      summaryQuery,
      SUMMARY_STAGE,
      filter,
    )?.column;
    return (
      column != null &&
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).name === measureName
    );
  });
}

function removeFilters(
  summaryQuery: Lib.Query,
  filters: Lib.FilterClause[],
): Lib.Query {
  return filters.reduce(
    (query, filter) => Lib.removeClause(query, SUMMARY_STAGE, filter),
    summaryQuery,
  );
}

function describeConditions(query: Lib.Query, filters: Lib.FilterClause[]) {
  return filters.map((filter) => describeCondition(query, filter)).join(", ");
}

/** "≥ 3", "between 3 and 10": the condition without the measure's name. */
function describeCondition(query: Lib.Query, filter: Lib.FilterClause) {
  const parts = Lib.numberFilterParts(query, SUMMARY_STAGE, filter);
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
  const aggregationNames = new Set(
    Lib.returnedColumns(summaryQuery, ROWS_STAGE)
      .map((column) => Lib.displayInfo(summaryQuery, ROWS_STAGE, column))
      .filter((info) => info.isAggregation)
      .map((info) => info.name),
  );
  return Lib.filterableColumns(summaryQuery, SUMMARY_STAGE).filter((column) =>
    aggregationNames.has(
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, column).name,
    ),
  );
}
