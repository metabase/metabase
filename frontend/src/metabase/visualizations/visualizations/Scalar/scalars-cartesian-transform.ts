import { t } from "ttag";

import type { TransformSeries } from "metabase/visualizations/components/TransformedVisualization";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { RawSeries } from "metabase-types/api";

import { findScalarMetricColumnIndex } from "./utils";

export const scalarToCartesianTransform: TransformSeries = rawSeries => {
  return rawSeries.map(({ card, data }) => {
    const metricColumnIndex = findScalarMetricColumnIndex({ card, data });

    const transformedDataset = {
      ...data,
      cols: [
        {
          base_type: TYPE.Text,
          display_name: t`Name`,
          name: "name",
          source: "query-transform",
        },
        {
          ...data.cols[metricColumnIndex],
          name: card.name,
          semantic_type: "type/Number",
        },
      ],
      rows: [[card.name, data.rows[0][metricColumnIndex]]],
    };

    const transformedCard = {
      ...card,
      display:
        card?.visualization_settings?.["scalar.multiseries.display"] ?? "bar",
      visualization_settings: {
        "graph.tooltip_type": "default",
        "graph.x_axis.labels_enabled": false,
        "stackable.stack_type": "stacked",
        "graph.dimensions": [transformedDataset.cols[0].name],
        "graph.metrics": [card.name],
        "legend.is_reversed": false,
        ...card?.visualization_settings,
      },
    };

    return {
      card: transformedCard,
      data: transformedDataset,
    };
  }) as RawSeries;
};
