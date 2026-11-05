import type React from "react";
import { useCallback, useMemo } from "react";

import type {
  OnChangeCardAndRun,
  OnChangeCardAndRunOpts,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  type ComputedVisualizationSettings,
  type RenderingContext,
  getComputedSettingsForSeries,
} from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

export type TransformSeries = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext?: RenderingContext,
) => RawSeries;

export interface TransformedVisualizationProps {
  transformSeries: TransformSeries;
  originalProps: VisualizationProps;
  VisualizationComponent: React.FC<VisualizationProps>;
  renderingContext?: RenderingContext;
}

export const TransformedVisualization = ({
  originalProps,
  VisualizationComponent,
  transformSeries,
  renderingContext,
}: TransformedVisualizationProps) => {
  const { rawSeries, settings, onChangeCardAndRun, ...restProps } =
    originalProps;

  const transformedSeries = useMemo(() => {
    return transformSeries(rawSeries, settings, renderingContext);
  }, [transformSeries, rawSeries, settings, renderingContext]);

  const transformedSettings = useMemo(() => {
    return getComputedSettingsForSeries(transformedSeries);
  }, [transformedSeries]);

  const handleChangeCardCandRun: OnChangeCardAndRun = useCallback(
    (options: OnChangeCardAndRunOpts) => {
      const cards = rawSeries.map((series) => series.card);
      const nextCard = cards.find((c) => c.id === options.nextCard.id);

      if (!nextCard) {
        throw new Error(
          `Could not find a matching card for ${JSON.stringify(
            options.nextCard,
          )}`,
        );
      }

      const transformedOptions: OnChangeCardAndRunOpts = {
        ...options,
        nextCard,
      };

      onChangeCardAndRun?.(transformedOptions);
    },
    [onChangeCardAndRun, rawSeries],
  );

  return (
    <VisualizationComponent
      {...restProps}
      rawSeries={transformedSeries}
      settings={transformedSettings}
      onChangeCardAndRun={handleChangeCardCandRun}
    />
  );
};
