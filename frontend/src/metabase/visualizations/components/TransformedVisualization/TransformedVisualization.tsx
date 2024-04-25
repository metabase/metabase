import type React from "react";
import { useMemo, useCallback } from "react";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  RenderingContext,
  OnChangeCardAndRun,
  OnChangeCardAndRunOpts,
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
      const cards = rawSeries.map(series => series.card);
      const previousCard =
        options.previousCard != null
          ? cards.find(c => c.id === options.previousCard?.id)
          : undefined;
      const nextCard = cards.find(c => c.id === options.nextCard.id);

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
        previousCard,
      };

      onChangeCardAndRun(transformedOptions);
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
