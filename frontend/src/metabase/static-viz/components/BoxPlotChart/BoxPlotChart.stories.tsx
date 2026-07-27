import type { StoryFn } from "@storybook/react";

import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import type { StaticChartProps } from "../StaticVisualization";
import { StaticVisualization } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "Viz/Static Viz/BoxPlotChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <StaticVisualization {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const SingleCategory = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.singleCategory as any,
    renderingContext,
  },
};

export const ManyCategories = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.manyCategories as any,
    renderingContext,
  },
};

export const LabelOverflow = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.labelOverflow as any,
    renderingContext,
  },
};

export const OutlierOverflow = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.outlierOverflow as any,
    renderingContext,
  },
};

export const PositiveNegativeCrossZeroYAxisAuto = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.positiveNegativeCrossZeroYAxisAuto as any,
    renderingContext,
  },
};

export const TopBottomMixedOutliers = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.topBottomMixedOutliers as any,
    renderingContext,
  },
};

export const ScaleExtremes = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.scaleExtremes as any,
    renderingContext,
  },
};

export const DistributionShapes = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.distributionShapes as any,
    renderingContext,
  },
};

export const LogScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logScale as any,
    renderingContext,
  },
};

export const LogScaleEdgeCases = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logScaleEdgeCases as any,
    renderingContext,
  },
};

export const LabelFormatting = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.labelFormatting as any,
    renderingContext,
  },
};

export const MinMaxNoOutliers = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.minMaxNoOutliers as any,
    renderingContext,
  },
};

export const PowScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powScale as any,
    renderingContext,
  },
};

export const MediumDenseTemporalData = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.mediumDenseTemporalData as any,
    renderingContext,
  },
};

export const DenseTemporalData = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.denseTemporalData as any,
    renderingContext,
  },
};

export const NumericDimensionTukey = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericDimensionTukey as any,
    renderingContext,
  },
};

export const NumericDimensionMinMax = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericDimensionMinMax as any,
    renderingContext,
  },
};

export const NumericMinMaxAllPoints = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericMinMaxAllPoints as any,
    renderingContext,
  },
};

export const BoxPlotCustomization = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.boxPlotCustomization as any,
    renderingContext,
  },
};

export const MultiSeriesBreakoutWithHiddenSortFormatting = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.multiSeriesBreakoutWithHiddenSortFormatting as any,
    renderingContext,
  },
};

export const MultiSeriesTwoMetricsWithAxisSplitFormatting = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.multiSeriesTwoMetricsWithAxisSplitFormatting as any,
    renderingContext,
  },
};
