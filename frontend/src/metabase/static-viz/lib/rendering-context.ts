import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";
import type { ColorPalette } from "metabase/ui/colors/types";
import {
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
  getCartesianChartSize,
  getVisualizationTheme,
} from "metabase/viz-core";

import { createColorGetter } from "../lib/colors";

import { measureTextHeight, measureTextWidth } from "./text";

export const withCartesianChartSize = (
  renderingContext: RenderingContext,
  size: { width: number; height: number },
): RenderingContext => {
  const cartesianSize = getCartesianChartSize(size);
  return {
    ...renderingContext,
    cartesianSize,
    theme: getVisualizationTheme({
      theme: DEFAULT_METABASE_COMPONENT_THEME,
      isStaticViz: true,
      cartesianSize,
    }),
  };
};

export const createStaticRenderingContext = (
  colors?: ColorPalette,
): RenderingContext => {
  const getColor = createColorGetter(colors);

  return {
    getColor,
    measureText: (text, style) => {
      const size =
        typeof style.size === "number" ? style.size : parseInt(style.size);
      const weight =
        typeof style.weight === "number"
          ? style.weight
          : parseInt(style.weight);

      if (!isFinite(size) || !isFinite(weight)) {
        throw new Error(
          `Incompatible for static rendering font style: ${JSON.stringify(
            style,
          )} `,
        );
      }
      return measureTextWidth(text, size, weight);
    },
    measureTextHeight: (_, style) =>
      measureTextHeight(
        typeof style.size === "number" ? style.size : parseInt(style.size),
      ),
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    isStatic: true,
    theme: DEFAULT_VISUALIZATION_THEME,
  };
};
