import type { CreateCustomVisualizationProps } from "custom-viz/src/types/viz";
import { t } from "ttag";

interface BuildCustomVizPropsOptions {
  getAssetUrl: (assetPath: string) => string;
}

export function buildCustomVizProps(
  opts: BuildCustomVizPropsOptions,
): CreateCustomVisualizationProps {
  return {
    translate: (text: string) => t`${text}`,
    getAssetUrl: opts.getAssetUrl,
  };
}
