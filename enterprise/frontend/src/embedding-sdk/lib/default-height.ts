import { CARD_SIZE_DEFAULTS_JSON } from "cljs/metabase.shared.dashboards.constants";
import type { CardDisplayType } from "metabase-types/api";

/**
 * How many pixels are in each cell?
 *
 * The card size default height are measured in number of cells,
 * so a display size of 5 cells would be 5 * VIZ_CELL_HEIGHT pixels tall.
 **/
const VIZ_CELL_HEIGHT = 50;

type VisualizationSize = { width: number; height: number };

const VISUALIZATION_SIZES: {
  [key: CardDisplayType]: {
    min: VisualizationSize;
    default: VisualizationSize;
  };
} = CARD_SIZE_DEFAULTS_JSON;

/**
 * Default height for each visualization type.
 *
 * The values are derived from the visualization's default size in the dashboard.
 */
export function getDefaultVizHeight(type: CardDisplayType): number {
  return VISUALIZATION_SIZES?.[type]?.default?.height * VIZ_CELL_HEIGHT;
}
