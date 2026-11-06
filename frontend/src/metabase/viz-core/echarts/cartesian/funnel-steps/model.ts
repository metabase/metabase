import type { ClickObject } from "metabase-lib";

import type { ComputedVisualizationSettings } from "../../../types";
import { NULL_CHAR } from "../constants/dataset";
import { getCartesianChartModel } from "../model";
import type {
  BaseCartesianChartModel,
  CartesianChartModel,
} from "../model/types";

import { getFunnelSteps } from "./steps";

export const FUNNEL_STEPS_GHOST_SERIES_ID = `${NULL_CHAR}funnel_steps_ghost`;

/**
 * A regular cartesian model whose ghost series (the hatched full-height bar
 * behind each step) resolves to the real series, so hovering or clicking it
 * hits the step's row. `withFunnelStepsDropOff` turns a click on a later
 * step's ghost into a click on who dropped off there.
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

/** An optional result column: the median seconds from the previous step, shown in the tooltip. */
export const FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN =
  "median_seconds_from_previous";

/** Set in a click's `extraData` when the click is on who dropped off before a step. */
export const FUNNEL_STEPS_DROP_OFF_KEY = "funnelStepsDropOff";

/**
 * A click on the ghost bar of a step after the first is on who dropped off
 * between the previous step and this one, as its tooltip says: the click is
 * marked in `extraData` and its value is how many dropped off.
 */
export const withFunnelStepsDropOff = (
  clicked: ClickObject,
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesId: string | undefined,
  stepIndex: number | undefined,
): ClickObject => {
  if (
    seriesId !== FUNNEL_STEPS_GHOST_SERIES_ID ||
    stepIndex === undefined ||
    stepIndex < 1
  ) {
    return clicked;
  }
  const counts = getFunnelSteps(chartModel, settings)?.counts;
  if (counts === undefined || stepIndex >= counts.length) {
    return clicked;
  }
  return {
    ...clicked,
    value: Math.max(0, counts[stepIndex - 1] - counts[stepIndex]),
    extraData: { ...clicked.extraData, [FUNNEL_STEPS_DROP_OFF_KEY]: true },
  };
};
