import { t } from "ttag";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

// Defines supported visualization settings
const SETTINGS_DEFINITIONS = {
  // Column formatting settings
  ...columnSettings({ hidden: true }),
  // Heatmap dimension column
  ...dimensionSetting("heatmap.dimension", {
    section: t`Data`,
    title: t`Dimension`,
    showColumnSetting: true,
  }),
  // Heatmap metric column
  ...metricSetting("heatmap.metric", {
    section: t`Data`,
    title: t`Measure`,
    showColumnSetting: true,
  }),
};

export const Heatmap = ({ rawSeries, settings }: VisualizationProps) => {
  // Assuming Heatmaps can use one card only, getting the dataset
  const [{ data }] = rawSeries;

  // Find dimension and metric columns
  const dimension = findWithIndex(
    data.cols,
    col => col.name === settings["heatmap.dimension"],
  );
  const metric = findWithIndex(
    data.cols,
    col => col.name === settings["heatmap.metric"],
  );

  // Create a dataset in the format expected by ECharts
  const echartsData = data.rows.map(row => {
    // Get dimension and metric values from a row
    const dimensionValue = row[dimension.index];
    const metricValue = row[metric.index];

    return [dimensionValue, metricValue];
  });

  // Finding latest year that exists in the dataset to select it in the calendar.
  // Ideally, users should be able to select it manually.
  const datasetLatestYear = echartsData.reduce(
    (latestYear: RowValue, row: RowValue[]) => {
      const currentDate = row[0];
      const currentDateYear = new Date(String(currentDate)).getFullYear();
      if (typeof latestYear !== "number") {
        return currentDateYear;
      }
      return Math.max(latestYear, currentDateYear);
    },
    null,
  );

  // Define ECharts option object that describes how to render the chart
  const option = {
    visualMap: {
      type: "piecewise",
      orient: "horizontal",
      left: "center",
      top: 65,
    },
    calendar: {
      top: 120,
      left: 80,
      right: 80,
      bottom: 120,
      cellSize: ["auto", 20],
      range: datasetLatestYear,
      itemStyle: {
        borderWidth: 0.5,
      },
    },
    series: {
      type: "heatmap",
      coordinateSystem: "calendar",
      data: echartsData,
    },
  };

  return <ResponsiveEChartsRenderer option={option} />;
};

Object.assign(Heatmap, {
  uiName: t`Heatmap`,
  identifier: "Heatmap",
  iconName: "grid",
  noun: t`Heatmap`,
  settings: SETTINGS_DEFINITIONS,
});
