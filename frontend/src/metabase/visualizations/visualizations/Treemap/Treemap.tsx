import { t } from "ttag";
import _ from "underscore";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { VisualizationProps } from "metabase/visualizations/types";

// Defines supported visualization settings
const SETTINGS_DEFINITIONS = {};

export const Treemap = ({ rawSeries, settings }: VisualizationProps) => {
  const option = {
    series: [
      {
        type: "treemap",
        data: [
          {
            name: "nodeA",
            value: 10,
            children: [
              {
                name: "nodeAa",
                value: 4,
              },
              {
                name: "nodeAb",
                value: 6,
              },
            ],
          },
          {
            name: "nodeB",
            value: 20,
            children: [
              {
                name: "nodeBa",
                value: 20,
                children: [
                  {
                    name: "nodeBa1",
                    value: 20,
                  },
                ],
              },
            ],
          },
        ],
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
  settings: SETTINGS_DEFINITIONS,
});
