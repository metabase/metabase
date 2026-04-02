import type { CreateCustomVisualizationProps } from "custom-viz/src/types/viz";

interface BuildCustomVizPropsOptions {
  locale: string;
  getAssetUrl: (assetPath: string) => string;
}

export function buildCustomVizProps(
  opts: BuildCustomVizPropsOptions,
): CreateCustomVisualizationProps {
  return {
    locale: opts.locale,
    getAssetUrl: opts.getAssetUrl,
  };
}
