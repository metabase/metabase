import { t } from "ttag";

import type { VisualizationDefinition } from "metabase/viz-core";
import type { DatasetColumn } from "metabase-types/api";

import { COHORT_COLUMNS, type CohortColumnName } from "./types";

const findMissingColumns = (cols: DatasetColumn[]): CohortColumnName[] =>
  COHORT_COLUMNS.filter((name) => !cols.some((col) => col.name === name));

/**
 * A retention grid for the cohorts analysis: one row per cohort, one column
 * per period after the cohort's start. Reads the columns the cohorts planner
 * emits, so it is hidden from the chart type picker.
 */
export const COHORT_TABLE_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Cohorts`,
  identifier: "cohort",
  iconName: "table2",
  hidden: true,
  noHeader: true,
  minSize: { width: 6, height: 4 },
  defaultSize: { width: 12, height: 6 },
  isSensible: ({ cols }) => findMissingColumns(cols).length === 0,
  checkRenderable: ([
    {
      data: { cols },
    },
  ]) => {
    const missing = findMissingColumns(cols);
    if (missing.length > 0) {
      throw new Error(
        t`The cohort table needs these columns: ${missing.join(", ")}`,
      );
    }
  },
  settings: {
    "cohort.period": {
      getDefault: () => "week",
    },
    "cohort.value_format": {
      getDefault: () => "percent",
    },
  },
};
