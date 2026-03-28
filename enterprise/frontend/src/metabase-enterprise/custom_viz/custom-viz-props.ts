import type { CreateCustomVisualizationProps } from "custom-viz/src/types/viz";
import { t } from "ttag";

interface BuildCustomVizPropsOptions {
  locale: string;
  getAssetUrl: (assetPath: string) => string;
}

export function buildCustomVizProps(
  opts: BuildCustomVizPropsOptions,
): CreateCustomVisualizationProps {
  return {
    locale: opts.locale,
    translate: (text: string) => t`${text}`,
    getAssetUrl: opts.getAssetUrl,
  };
}
