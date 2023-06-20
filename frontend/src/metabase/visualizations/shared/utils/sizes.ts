import _ from "underscore";
import { DEFAULT_CARD_SIZE, GRID_WIDTH } from "metabase/lib/dashboard_grid";
import { CardDisplayType } from "metabase-types/api";

type VisualizationSize = { width: number; height: number };
const VISUALIZATION_SIZES: {
  [key: CardDisplayType]: {
    min: VisualizationSize;
    default: VisualizationSize;
  };
} = {
  line: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  area: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  bar: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  stacked: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  combo: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  row: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  scatter: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  waterfall: {
    min: { width: 4, height: 3 },
    default: { width: 14, height: 6 },
  },
  pie: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  funnel: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  gauge: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  progress: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  map: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  table: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  pivot: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  object: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  scalar: {
    min: { width: 1, height: 1 },
    default: { width: 4, height: 3 },
  },
  smartscalar: {
    min: { width: 4, height: 3 },
    default: { width: 4, height: 3 },
  },
  link: {
    min: { width: 1, height: 1 },
    default: { width: 4, height: 1 },
  },
  action: {
    min: { width: 1, height: 1 },
    default: { width: 4, height: 1 },
  },
  heading: {
    min: { width: 1, height: 1 },
    default: { width: GRID_WIDTH, height: 1 },
  },
  text: {
    min: { width: 1, height: 1 },
    default: { width: 6, height: 3 },
  },
};

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
