export const BOXPLOT_SERIES_NAME = "Box Plot";
export const OUTLIERS_SERIES_NAME = "Outliers";
export const DATA_POINTS_SERIES_NAME = "Data points";
export const MEAN_SERIES_NAME = "Mean";

export type BoxPlotStat = "min" | "q1" | "median" | "q3" | "max" | "mean";

export const BOXPLOT_STATS: BoxPlotStat[] = [
  "min",
  "q1",
  "median",
  "q3",
  "max",
  "mean",
];

export const BOXPLOT_BOX_WIDTH_RATIO = 0.7;
export const BOXPLOT_MIN_BOX_WIDTH = 3;
export const BOXPLOT_MAX_BOX_WIDTH = 60;
export const BOXPLOT_LABEL_PADDING = 4;

export const BOX_FILL_OPACITY = 0.15;
export const EMPHASIS_DARKEN_FACTOR = 0.2;
export const MEAN_COLOR_DARKEN_FACTOR = 0.3;
export const BLUR_OPACITY = 0.7;
export const NON_OUTLIER_OPACITY = 0.6;
export const MEAN_SYMBOL_SIZE_OFFSET = 2;
export const LABEL_DISTANCE = 3;

export const BOXPLOT_DATA_LABEL_STYLE = {
  fontWeight: 400,
  fontSize: 13,
  textBorderWidth: 3,
};

export const BOXPLOT_MIN_SYMBOL_SIZE = 5;
export const BOXPLOT_MAX_SYMBOL_SIZE = 10;
export const BOXPLOT_SYMBOL_SIZE_RATIO = 0.15;

export const SIDE_LABELS_MIN_GAP_RATIO = 1.5;
