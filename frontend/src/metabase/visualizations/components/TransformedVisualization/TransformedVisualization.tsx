import type React from "react";
import { useMemo } from "react";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

export type TransformSeries = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) => RawSeries;

export interface TransformedVisualizationProps {
  transformSeries: TransformSeries;
  originalProps: VisualizationProps;
  VisualizationComponent: React.ComponentType<VisualizationProps>;
}

export const TransformedVisualization = ({
  originalProps,
  VisualizationComponent,
  transformSeries,
}: TransformedVisualizationProps) => {
  const { rawSeries, settings, ...restProps } = originalProps;

  const transformedSeries = useMemo(() => {
    return transformSeries(rawSeries, settings);
  }, [transformSeries, rawSeries, settings]);

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
