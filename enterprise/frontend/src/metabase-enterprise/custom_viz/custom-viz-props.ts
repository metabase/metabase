import type { CreateCustomVisualizationProps } from "custom-viz/src/types/viz";
import { t } from "ttag";

import type {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";

type TextWidthMeasurer = (text: string, style: FontStyle) => number;
type TextHeightMeasurer = (text: string, style: FontStyle) => number;

interface BuildCustomVizPropsOptions {
  measureText: TextMeasurer;
  measureTextWidth: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  getAssetUrl: (assetPath: string) => string;
}

export function buildCustomVizProps(
  opts: BuildCustomVizPropsOptions,
): CreateCustomVisualizationProps {
  return {
    translate: (text: string) => t`${text}`,
    getAssetUrl: opts.getAssetUrl,
    measureText: opts.measureText,
    measureTextWidth: opts.measureTextWidth,
    measureTextHeight: opts.measureTextHeight,
  };
}
