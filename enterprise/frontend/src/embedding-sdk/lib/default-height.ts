import { getDefaultSize } from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDisplay } from "metabase-types/api";

/**
 * How many pixels are in each cell?
 *
 * The card size default height are measured in number of cells,
 * so a display size of 5 cells would be 5 * VIZ_CELL_HEIGHT pixels tall.
 **/
const VIZ_CELL_HEIGHT = 50;

/**
 * Default height for each visualization type.
 *
 * The values are derived from the visualization's default size in the dashboard.
 */
export const getDefaultVizHeight = (type: VisualizationDisplay): number =>
  getDefaultSize(type).height * VIZ_CELL_HEIGHT;
