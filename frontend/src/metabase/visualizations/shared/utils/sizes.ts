import _ from "underscore";

import { CARD_SIZE_DEFAULTS_JSON } from "cljs/metabase.models.dashboard.constants";
import { DEFAULT_CARD_SIZE } from "metabase/lib/dashboard_grid";
import type { VisualizationDisplay } from "metabase-types/api";

type VisualizationSize = { width: number; height: number };
const VISUALIZATION_SIZES: Record<
  VisualizationDisplay,
  {
    min: VisualizationSize;
    default: VisualizationSize;
  }
> = CARD_SIZE_DEFAULTS_JSON;

const getSize = (
  visualizationType: VisualizationDisplay,
  sizeKey: "min" | "default",
): VisualizationSize =>
  _.get(
    VISUALIZATION_SIZES,
    [visualizationType, sizeKey],
    DEFAULT_CARD_SIZE,
  ) as VisualizationSize;

export const getMinSize = (
  visualizationType: VisualizationDisplay,
): VisualizationSize => getSize(visualizationType, "min");

export const getDefaultSize = (
  visualizationType: VisualizationDisplay,
): VisualizationSize => getSize(visualizationType, "default");

type CalculateMobileHeight = (desktopHeight: number) => number;

export const MOBILE_HEIGHT_BY_DISPLAY_TYPE: Record<
  string,
  number | CalculateMobileHeight
> = {
  action: 1,
  link: 1,
  text: desktopHeight => Math.max(2, desktopHeight),
  heading: 2,
  scalar: 4,
};

export const MOBILE_DEFAULT_CARD_HEIGHT = 6;

export const getMobileHeight = (
  display: VisualizationDisplay,
  desktopHeight: number,
) => {
  const mobileHeight =
    MOBILE_HEIGHT_BY_DISPLAY_TYPE[display] ?? MOBILE_DEFAULT_CARD_HEIGHT;

  return typeof mobileHeight === "function"
    ? mobileHeight(desktopHeight)
    : mobileHeight;
};
