import type { ColorPalette } from "metabase/lib/colors/types";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { createColorGetter } from "../lib/colors";

import { measureTextHeight, measureTextWidth } from "./text";

export const createStaticRenderingContext = (
  colors?: ColorPalette,
): RenderingContext => {
  const getColor = createColorGetter(colors);
  return {
    getColor,
    measureText: (text, style) => {
      if (typeof style.size !== "number" || typeof style.weight !== "number") {
        throw new Error(
          `Incompatible for static rendering font style: ${JSON.stringify(
            style,
          )} `,
        );
      }
      return measureTextWidth(text, style.size, style.weight);
    },
    measureTextHeight: (_, { size }) =>
      measureTextHeight(typeof size === "number" ? size : parseInt(size)),
    fontFamily: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    theme: DEFAULT_VISUALIZATION_THEME,
  };
};
