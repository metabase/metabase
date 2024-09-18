import { t } from "ttag";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getOptionFromColumn,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { getDefaultDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

const MAX_TREEMAP_DIMENSIONS = 100;

// Defines supported visualization settings
const SETTING_DEFINITIONS = {
  // Column formatting settings
  ...columnSettings({ hidden: true }),
  // Treemap dimensions
  "treemap.dimensions": {
    section: t`Data`,
    title: t`Dimensions`,
    widget: "fields",
    getDefault: (rawSeries: RawSeries) =>
      getDefaultDimensionsAndMetrics(rawSeries, MAX_TREEMAP_DIMENSIONS, 1)
        .dimensions,
    persistDefault: true,
    getProps: ([{ data }]) => {
      const options = data.cols.map(getOptionFromColumn);
      return {
        options,
        addAnother: true,
        columns: data.cols,
      };
    },
  },

  // Heatmap metric column
  ...metricSetting("treemap.metric", {
    section: t`Data`,
    title: t`Measure`,
    showColumnSetting: true,
  }),
};

export const Treemap = ({ rawSeries, settings }: VisualizationProps) => {
  console.log(rawSeries);

  const [{ data }] = rawSeries;

  const dimension = findWithIndex(
    data.cols,
    col => col.name === settings["treemap.dimension"],
  );

  const metric = findWithIndex(
    data.cols,
    col => col.name === settings["treemap.metric"],
  );

  const echartsData = data.rows.map(row => {
    const dimensionValue = row[dimension.index];
    const metricValue = row[metric.index];
    return {
      name: dimensionValue,
      value: metricValue,
    };
  });

  const option = {
    series: [
      {
        type: "treemap",
        name: t`ALL`,
        data: echartsData,
      },
    ],
  };

  return <ResponsiveEChartsRenderer option={option} />;
};

Object.assign(Treemap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "treemap",
  noun: t`Treemap`,
  settings: SETTING_DEFINITIONS,
});
