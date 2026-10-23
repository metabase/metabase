import { t } from "ttag";

import { color } from "metabase/ui/colors";
import {
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
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
  // A table, so it starts and shrinks like one on a dashboard.
  minSize: getMinSize("table"),
  defaultSize: getDefaultSize("table"),
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
    "cohort.color": {
      getSection: () => t`Display`,
      get title() {
        return t`Base color`;
      },
      widget: "color",
      getDefault: () => color("brand"),
    },
    "cohort.color_scale": {
      getSection: () => t`Display`,
      get title() {
        return t`Color scale`;
      },
      widget: "segmentedControl",
      getDefault: () => "table",
      getProps: () => ({
        options: [
          { name: t`Whole table`, value: "table" },
          { name: t`Each column`, value: "column" },
        ],
      }),
    },
    "cohort.initial_count": {
      getSection: () => t`Display`,
      get title() {
        return t`Initial count column`;
      },
      widget: "segmentedControl",
      getDefault: () => "show",
      getProps: () => ({
        options: [
          { name: t`Show`, value: "show" },
          { name: t`Hide`, value: "hide" },
        ],
      }),
    },
    "cohort.density": {
      getSection: () => t`Display`,
      get title() {
        return t`Density`;
      },
      widget: "segmentedControl",
      getDefault: () => "loose",
      getProps: () => ({
        options: [
          { name: t`Loose`, value: "loose" },
          { name: t`Compact`, value: "compact" },
        ],
      }),
    },
  },
};
