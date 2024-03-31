import type React from "react";
import { useMemo } from "react";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

export type TransformSeries = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => RawSeries;

export interface TransformedVisualizationProps {
  transformSeries: TransformSeries;
  originalProps: VisualizationProps;
  VisualizationComponent: React.FC<VisualizationProps>;
  renderingContext: RenderingContext;
}

export const TransformedVisualization = ({
  originalProps,
  VisualizationComponent,
  transformSeries,
  renderingContext,
}: TransformedVisualizationProps) => {
  const { rawSeries, settings, ...restProps } = originalProps;

  const transformedSeries = useMemo(() => {
    return transformSeries(rawSeries, settings, renderingContext);
  }, [transformSeries, rawSeries, settings, renderingContext]);

  const transformedSettings = useMemo(() => {
    return getComputedSettingsForSeries(transformedSeries);
  }, [transformedSeries]);

  return (
    <VisualizationComponent
      {...restProps}
      rawSeries={transformedSeries}
      settings={transformedSettings}
    />
  );
};
