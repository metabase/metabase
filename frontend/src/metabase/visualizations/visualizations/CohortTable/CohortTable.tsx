import cx from "classnames";
import type { MouseEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import { assignLazily } from "metabase/utils/merge-lazily";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";

import S from "./CohortTable.module.css";
import { COHORT_TABLE_DEFINITION } from "./definition";
import type { CohortRow as CohortRowData } from "./types";
import {
  formatCellValue,
  formatCohortLabel,
  formatPeriodHeader,
  getCellColors,
  isDateCohort,
  isFuturePeriod,
  pivotCohorts,
  toPeriod,
  toValueFormat,
} from "./utils";

const CohortTableComponent = ({
  rawSeries,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: VisualizationProps) => {
  const [{ data }] = rawSeries;
  const period = toPeriod(settings["cohort.period"]);
  const valueFormat = toValueFormat(settings["cohort.value_format"]);
  const baseColor: string = settings["cohort.color"];
  const isColumnScale = settings["cohort.color_scale"] === "column";
  const showInitialCount = settings["cohort.initial_count"] !== "hide";
  const isCompact = settings["cohort.density"] === "compact";

  const { cohorts, offsets, tableMax, columnMaxes, showYear } = useMemo(() => {
    const cohorts = pivotCohorts(data);
    const offsets = [
      ...new Set(cohorts.flatMap((cohort) => [...cohort.values.keys()])),
    ].sort((a, b) => a - b);
    const values = cohorts.flatMap((cohort) => [...cohort.values.values()]);
    const years = new Set(
      cohorts
        .filter((cohort) => isDateCohort(cohort.key))
        .map((cohort) => cohort.key.slice(0, 4)),
    );
    return {
      cohorts,
      offsets,
      tableMax: valueFormat === "percent" ? 1 : Math.max(0, ...values),
      // Each period column shaded against its own highest value, so later
      // periods, where every value is small, still show their differences.
      columnMaxes: offsets.map((offset) =>
        Math.max(0, ...cohorts.map((cohort) => cohort.values.get(offset) ?? 0)),
      ),
      showYear: years.size > 1,
    };
  }, [data, valueFormat]);
  const maxes = isColumnScale ? columnMaxes : offsets.map(() => tableMax);
  const leadColumns = showInitialCount ? "auto auto" : "auto";

  // A cell is its cohort and period, as a chart point's dimensions, so the
  // host's click actions can trace it back to the people in it.
  const getCellClick = (
    cohort: CohortRowData,
    offset: number,
  ): ClickObject | null => {
    const column = (name: string) => data.cols.find((col) => col.name === name);
    const cohortColumn = column("cohort");
    const offsetColumn = column("offset");
    const valueColumn = column("value");
    const value = cohort.values.get(offset);
    if (!cohortColumn || !offsetColumn || !valueColumn || value === undefined) {
      return null;
    }
    return {
      value,
      column: valueColumn,
      dimensions: [
        { column: cohortColumn, value: cohort.key },
        { column: offsetColumn, value: offset },
      ],
      data: [
        { col: cohortColumn, value: cohort.key },
        { col: offsetColumn, value: offset },
        { col: valueColumn, value },
      ],
    };
  };
  const isClickable = (cohort: CohortRowData, offset: number) =>
    visualizationIsClickable(getCellClick(cohort, offset));
  const handleCellClick = (
    cohort: CohortRowData,
    offset: number,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    const clicked = getCellClick(cohort, offset);
    if (clicked !== null && visualizationIsClickable(clicked)) {
      onVisualizationClick({ ...clicked, element: event.currentTarget });
    }
  };

  return (
    // The scroller is absolutely positioned so the grid adds nothing to the
    // card's height: the card keeps its size and the grid scrolls inside it.
    <Box flex={1} pos="relative">
      <Box pos="absolute" inset={0} style={{ overflow: "auto" }}>
        <Box
          className={S.root}
          data-show-initial-count={showInitialCount}
          data-density={isCompact ? "compact" : "loose"}
          style={{
            gridTemplateColumns: `${leadColumns} repeat(${offsets.length}, minmax(var(--cohort-cell-min-width), 1fr))`,
          }}
        >
          <div className={S.headerRow}>
            <div className={S.frozen}>
              <div className={S.headerLabel}>{t`Cohort`}</div>
              {showInitialCount && (
                <div className={S.header}>{t`Initial count`}</div>
              )}
            </div>
            {offsets.map((offset) => (
              <div key={offset} className={S.header}>
                {formatPeriodHeader(period, offset)}
              </div>
            ))}
          </div>
          {cohorts.map((cohort) => (
            <CohortRow
              key={cohort.key}
              label={formatCohortLabel(cohort.key, period, { showYear })}
              size={showInitialCount ? cohort.size : null}
              cells={offsets.map((offset) =>
                isFuturePeriod(cohort.key, offset, period)
                  ? null
                  : (cohort.values.get(offset) ?? null),
              )}
              maxes={maxes}
              valueFormat={valueFormat}
              baseColor={baseColor}
              isCellClickable={(index) => isClickable(cohort, offsets[index])}
              onCellClick={(index, event) =>
                handleCellClick(cohort, offsets[index], event)
              }
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
};

type CohortRowProps = {
  label: string;
  /** Null when the initial count column is hidden. */
  size: number | null;
  /** One per period column; null when the period has no data yet. */
  cells: (number | null)[];
  /** The value each cell's color is scaled against, one per period column. */
  maxes: number[];
  valueFormat: "percent" | "counts";
  baseColor: string;
  /** By the cell's index among the period columns. */
  isCellClickable: (index: number) => boolean;
  onCellClick: (index: number, event: MouseEvent<HTMLDivElement>) => void;
};

const CohortRow = ({
  label,
  size,
  cells,
  maxes,
  valueFormat,
  baseColor,
  isCellClickable,
  onCellClick,
}: CohortRowProps) => (
  <>
    <div className={S.frozen}>
      <div className={S.label}>{label}</div>
      {size !== null && (
        <div className={S.size}>{new Intl.NumberFormat().format(size)}</div>
      )}
    </div>
    {cells.map((value, offset) => {
      if (value === null) {
        return <div key={offset} />;
      }
      const { background, isLightText } = getCellColors(
        value,
        maxes[offset],
        baseColor,
      );
      const isClickable = isCellClickable(offset);
      return (
        <div
          key={offset}
          className={cx(S.cell, {
            [S.lightText]: isLightText,
            [S.clickable]: isClickable,
          })}
          style={{ background }}
          onClick={
            isClickable ? (event) => onCellClick(offset, event) : undefined
          }
        >
          {formatCellValue(value, valueFormat)}
        </div>
      );
    })}
  </>
);

export const CohortTable = assignLazily(
  CohortTableComponent,
  COHORT_TABLE_DEFINITION,
);
