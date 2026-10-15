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

  const { cohorts, offsets, max, showYear } = useMemo(() => {
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
      max: valueFormat === "percent" ? 1 : Math.max(0, ...values),
      showYear: years.size > 1,
    };
  }, [data, valueFormat]);

  return (
    <Box h="100%" style={{ overflow: "auto" }}>
      <Box
        className={S.root}
        style={{
          gridTemplateColumns: `auto auto repeat(${offsets.length}, minmax(4.5rem, 1fr))`,
        }}
      >
        <div className={S.headerLabel}>{t`Cohort`}</div>
        <div className={S.header}>{t`Initial count`}</div>
        {offsets.map((offset) => (
          <div key={offset} className={S.header}>
            {formatPeriodHeader(period, offset)}
          </div>
        ))}
        {cohorts.map((cohort) => (
          <CohortRow
            key={cohort.key}
            label={formatCohortLabel(cohort.key, period, { showYear })}
            size={cohort.size}
            cells={offsets.map((offset) =>
              isFuturePeriod(cohort.key, offset, period)
                ? null
                : (cohort.values.get(offset) ?? null),
            )}
            max={max}
            valueFormat={valueFormat}
          />
        ))}
      </Box>
    </Box>
  );
};

type CohortRowProps = {
  label: string;
  size: number;
  /** One per period column; null when the period has no data yet. */
  cells: (number | null)[];
  max: number;
  valueFormat: "percent" | "counts";
};

const CohortRow = ({
  label,
  size,
  cells,
  max,
  valueFormat,
}: CohortRowProps) => (
  <>
    <div className={S.label}>{label}</div>
    <div className={S.size}>{new Intl.NumberFormat().format(size)}</div>
    {cells.map((value, offset) => {
      if (value === null) {
        return <div key={offset} />;
      }
      const { background, isLightText } = getCellColors(value, max);
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
