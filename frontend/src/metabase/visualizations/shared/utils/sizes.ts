import _ from "underscore";
import { DEFAULT_CARD_SIZE } from "metabase/lib/dashboard_grid";
import type { CardDisplayType } from "metabase-types/api";
import { card_size_defaults } from "cljs/metabase.shared.automagic_dashboards.constants";

type VisualizationSize = { width: number; height: number };
const VISUALIZATION_SIZES: {
  [key: CardDisplayType]: {
    min: VisualizationSize;
    default: VisualizationSize;
  };
} = card_size_defaults;

const getSize = (
  visualizationType: CardDisplayType,
  sizeKey: "min" | "default",
): VisualizationSize => {
  return _.get(
    VISUALIZATION_SIZES,
    [visualizationType, sizeKey],
    DEFAULT_CARD_SIZE,
  ) as VisualizationSize;
};

export const getMinSize = (
  visualizationType: CardDisplayType,
): VisualizationSize => getSize(visualizationType, "min");
export const getDefaultSize = (
  visualizationType: CardDisplayType,
): VisualizationSize => getSize(visualizationType, "default");

export const MOBILE_HEIGHT_BY_DISPLAY_TYPE: Record<string, number> = {
  action: 1,
  link: 1,
  text: 2,
  heading: 2,
  scalar: 4,
};

export const MOBILE_DEFAULT_CARD_HEIGHT = 6;
