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

// Defines supported visualization settings
const SETTING_DEFINITIONS = {
  // Column formatting settings
  ...columnSettings({ hidden: true }),
  // // Treemap dimension column
  ...dimensionSetting("treemap.name", {
    section: t`Data`,
    title: t`Name`,
    showColumnSetting: true,
  }),
  ...dimensionSetting("treemap.parent", {
    section: t`Data`,
    title: t`Parent`,
    showColumnSetting: true,
  }),
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
  iconName: "grid",
  noun: t`Treemap`,
  settings: SETTING_DEFINITIONS,
});
