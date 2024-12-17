import type { ColorPalette } from "metabase/lib/colors/types";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { createColorGetter } from "../lib/colors";

import { measureTextHeight, measureTextWidth } from "./text";

interface RenderingOptions {
  applicationColors?: ColorPalette;
  startOfWeek: string;
}

export const createStaticRenderingContext = (
  options: RenderingOptions,
): RenderingContext => {
  const { applicationColors, startOfWeek } = options;
  const getColor = createColorGetter(applicationColors);

  return {
    getColor,
    startOfWeek: startOfWeek,
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
    theme: DEFAULT_VISUALIZATION_THEME,
  };
};
