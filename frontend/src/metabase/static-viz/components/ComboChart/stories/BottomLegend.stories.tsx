import { updateIn } from "icepick";

import { StaticVisualization } from "../../StaticVisualization";
import { data } from "../stories-data";

import { Template, renderingContext } from "./shared";

export default {
  title: "Viz/Static Viz/ComboChart/legend",
  component: StaticVisualization,
};

// The legend sits below the plot, centered between the y-axis and the right edge.
export const BelowPlot = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLinear,
    renderingContext,
  },
};

// Every item stays visible: a narrow chart wraps them onto more rows.
export const NarrowWraps = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLinear,
    renderingContext,
    width: 320,
    height: 280,
  },
};

export const ManyRows = {
  render: Template,
  args: {
    rawSeries: data.barMaxCategoriesDefault,
    renderingContext,
    width: 360,
    height: 300,
  },
};

// The rows shrink the plot instead of growing the image.
export const ManyRowsFitWithinBounds = {
  render: Template,
  args: {
    rawSeries: data.barMaxCategoriesDefault,
    renderingContext,
    width: 360,
    height: 300,
    fitWithinBounds: true,
  },
};

export const Reversed = {
  render: Template,
  args: {
    rawSeries: updateIn(
      data.twoBarsTwoAreasOneLineLinear,
      [0, "card", "visualization_settings"],
      (settings) => ({ ...settings, "legend.is_reversed": true }),
    ),
    renderingContext,
  },
};

// With axes on both sides the legend centers on the plot between them.
export const TwoYAxes = {
  render: Template,
  args: {
    rawSeries: data.barCorrectWidthWhenTwoYAxes,
    renderingContext,
  },
};

export const RightAxisOnly = {
  render: Template,
  args: {
    rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly,
    renderingContext,
  },
};
