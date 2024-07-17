import { t } from "ttag";

import type { TransformSeries } from "metabase/visualizations/components/TransformedVisualization";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { DatasetColumn, SingleSeries } from "metabase-types/api";

import { findScalarMetricColumnIndex } from "./utils";

export const scalarToSingleSeriesTransform: TransformSeries = rawSeries => {
  const [firstSeries] = rawSeries;

  const firstSeriesMetricColumnIndex = findScalarMetricColumnIndex(firstSeries);
  const firstSeriesMetricColumn =
    firstSeries.data.cols[firstSeriesMetricColumnIndex];

  const cols = [
    {
      base_type: TYPE.Text,
      display_name: t`Name`,
      name: "name",
      source: "query-transform",
    },
    {
      ...firstSeriesMetricColumn,
      name: firstSeries.card.name,
      semantic_type: "type/Number",
    },
  ];

  const display =
    firstSeries.card?.visualization_settings?.["scalar.multiseries.display"] ??
    "table";

  const transformedCard = {
    ...firstSeries.card,
    display,
    visualization_settings: {
      ...getTransformedSettings(display, cols),
      ...firstSeries.card?.visualization_settings,
    },
  };

  const transformedSeries: SingleSeries = {
    card: transformedCard,
    data: {
      cols,
      rows: [],
    },
  };

  rawSeries.forEach(({ card, data }) => {
    const metricColumnIndex = findScalarMetricColumnIndex({ card, data });
    const metricValue = data.rows[0][metricColumnIndex];
    transformedSeries.data.rows.push([card.name, metricValue]);
  });

  return [transformedSeries];
};

function getTransformedSettings(display: string, cols: DatasetColumn[]) {
  if (display === "funnel") {
    return {
      "funnel.type": "funnel",
      "funnel.dimensions": [cols[0].name],
      "funnel.metrics": [cols[1].name],
    };
  }
  return {};
}
