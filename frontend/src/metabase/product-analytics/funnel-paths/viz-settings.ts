import { getPathColors } from "metabase/viz-core";
import type { VisualizationSettings } from "metabase-types/api";

import { OUTCOME_COLUMN, getOutcomeLabels } from "../sql/analyses/funnel-paths";

/** A paths chart with each link split into the people who converted and the rest. */
export const getFunnelPathsVizSettings = (): VisualizationSettings => {
  const outcomes = getOutcomeLabels();
  const colors = getPathColors();
  return {
    "sankey.source": "source",
    "sankey.target": "target",
    "sankey.value": "weight",
    "sankey.breakout": OUTCOME_COLUMN,
    "sankey.breakout_colors": {
      [outcomes.converted]: colors.converted,
      [outcomes.notConverted]: colors.dropped,
    },
    "product_analytics.paths": true,
  };
};
