import type React from "react";
import { useCallback, useMemo } from "react";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  RenderingContext,
  OnChangeCardAndRun,
} from "metabase/visualizations/types";
import type { Card, RawSeries, SingleSeries } from "metabase-types/api";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

const findOriginalCard = (
  transformedSeries: TransformedSeries,
  transformedCard?: Card,
) => {
  if (!transformedCard) {
    return undefined;
  }

  const series = transformedSeries.find(
    series => series.card === transformedCard,
  );

  return series?.originalCard;
};

export type TransformedSeries = (SingleSeries & { originalCard: Card })[];

export type TransformSeries = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => TransformedSeries;

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
  }, [transformSeries, rawSeries, settings]);

  const transformedSettings = useMemo(() => {
    return getComputedSettingsForSeries(transformedSeries);
  }, [transformedSeries]);

  const handleChangeCardAndRun: OnChangeCardAndRun = useCallback(
    options => {
      const nextCard = findOriginalCard(transformedSeries, options.nextCard);
      const previousCard = findOriginalCard(
        transformedSeries,
        options.previousCard,
      );

      if (!nextCard) {
        throw new Error("Could not find original card for transformed card");
      }

      originalProps?.onChangeCardAndRun({
        ...options,
        nextCard,
        previousCard,
      });
    },
    [transformedSeries, originalProps?.onChangeCardAndRun],
  );

  return (
    <VisualizationComponent
      {...restProps}
      rawSeries={transformedSeries}
      settings={transformedSettings}
      onChangeCardAndRun={handleChangeCardAndRun}
    />
  );
};
