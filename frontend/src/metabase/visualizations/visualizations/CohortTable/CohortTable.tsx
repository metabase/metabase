import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
import { assignLazily } from "metabase/utils/merge-lazily";
import type { VisualizationProps } from "metabase/visualizations/types";

import S from "./CohortTable.module.css";
import { COHORT_TABLE_DEFINITION } from "./definition";
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

const CohortTableComponent = ({ rawSeries, settings }: VisualizationProps) => {
  const [{ data }] = rawSeries;
  const period = toPeriod(settings["cohort.period"]);
  const valueFormat = toValueFormat(settings["cohort.value_format"]);
  const baseColor: string = settings["cohort.color"];
  const isColumnScale = settings["cohort.color_scale"] === "column";
  const showInitialCount = settings["cohort.initial_count"] !== "hide";

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

  return (
    // The scroller is absolutely positioned so the grid adds nothing to the
    // card's height: the card keeps its size and the grid scrolls inside it.
    <Box flex={1} pos="relative">
      <Box pos="absolute" inset={0} style={{ overflow: "auto" }}>
        <Box
          className={S.root}
          data-show-initial-count={showInitialCount}
          style={{
            gridTemplateColumns: `${leadColumns} repeat(${offsets.length}, minmax(4.5rem, 1fr))`,
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
};

const CohortRow = ({
  label,
  size,
  cells,
  maxes,
  valueFormat,
  baseColor,
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
      return (
        <div
          key={offset}
          className={cx(S.cell, { [S.lightText]: isLightText })}
          style={{ background }}
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
