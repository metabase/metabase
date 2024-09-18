import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getOptionFromColumn,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { getDefaultDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { buildTreemapOption } from "./option";

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
    getProps: ([{ data }]: any) => {
      const options = data.cols.map(getOptionFromColumn);
      return {
        options,
        addAnother: t`Add dimension`,
        columns: data.cols,
      };
    },
  },

  // Heatmap metric column
  ...metricSetting("treemap.metric", {
    section: t`Data`,
    title: t`Measure`,
    persistDefault: true,
    showColumnSetting: true,
    getDefault: (rawSeries: RawSeries) =>
      getDefaultDimensionsAndMetrics(rawSeries, MAX_TREEMAP_DIMENSIONS, 1)
        .metrics[0],
  }),
};

export const Treemap = ({ rawSeries, settings }: VisualizationProps) => {
  const option = useMemo(() => {
    return buildTreemapOption(rawSeries, settings);
  }, [rawSeries, settings]);

  return <ResponsiveEChartsRenderer option={option} />;
};

Object.assign(Treemap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "treemap",
  noun: t`Treemap`,
  settings: SETTING_DEFINITIONS,
});
