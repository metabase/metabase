import { NULL_CHAR } from "../constants/dataset";
import { getCartesianChartModel } from "../model";
import type { CartesianChartModel } from "../model/types";

export const FUNNEL_STEPS_GHOST_SERIES_ID = `${NULL_CHAR}funnel_steps_ghost`;

/**
 * A regular cartesian model whose ghost series (the hatched full-height bar
 * behind each step) resolves to the real series, so hovering or clicking it
 * behaves exactly like hovering or clicking the step's bar.
 */
export const getFunnelStepsModel = (
  ...args: Parameters<typeof getCartesianChartModel>
): CartesianChartModel => {
  const model = getCartesianChartModel(...args);
  const [seriesModel] = model.seriesModels;
  if (!seriesModel) {
    return model;
  }

  return {
    ...model,
    seriesIdToDataKey: {
      ...model.seriesIdToDataKey,
      [FUNNEL_STEPS_GHOST_SERIES_ID]: seriesModel.dataKey,
    },
  };
};
