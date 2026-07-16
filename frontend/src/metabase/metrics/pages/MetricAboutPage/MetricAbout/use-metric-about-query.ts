import { useMemo } from "react";

import { useGetMetricQuery } from "metabase/api";
import { useCardQueryData } from "metabase/common/data-studio/hooks/use-card-query-data";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import { DEFAULT_DISPLAY_TYPE_BY_DIMENSION } from "metabase/common/metrics/utils/dimension-types";
import {
  useMetricDefinition,
  useMetricDimensionQuery,
} from "metabase/metrics/common/hooks";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";

export function useMetricAboutQuery(
  card: Card,
  selectedDimensionId: string | null,
) {
  const { data: metric, isLoading: isLoadingMetric } = useGetMetricQuery(
    card.id,
  );
  const { definition } = useMetricDefinition(card.id);

  const defaultDimensionId =
    metric?.dimensions.find(
      (dimension) =>
        dimension.default && dimension.status !== "status/orphaned",
    )?.id ?? null;

  const dimensionDescriptors = definition
    ? getDimensionDescriptors(definition)
    : null;
  const dimensionOptions =
    metric?.dimensions.flatMap((dimension) => {
      const descriptor = dimensionDescriptors?.get(dimension.id);
      if (dimension.status === "status/orphaned" || !descriptor) {
        return [];
      }

      return [{ value: dimension.id, label: descriptor.displayName }];
    }) ?? [];
  const activeDimensionId = selectedDimensionId ?? defaultDimensionId;

  const activeDimensionType =
    activeDimensionId && dimensionDescriptors
      ? (dimensionDescriptors.get(activeDimensionId)?.dimensionType ?? null)
      : null;

  const isWaitingForDefinition = activeDimensionId != null && !definition;
  const useDimension = activeDimensionType != null;
  const { data: dimensionData, isLoading: isLoadingDimension } =
    useMetricDimensionQuery(
      definition,
      useDimension ? activeDimensionId : null,
    );
  const { data: cardData, isLoading: isLoadingCard } = useCardQueryData(card, {
    skip: isLoadingMetric || isWaitingForDefinition || useDimension,
  });

  const data = useDimension ? dimensionData : cardData;
  const isLoading =
    isLoadingMetric ||
    isWaitingForDefinition ||
    (useDimension ? isLoadingDimension : isLoadingCard);

  const visualizationCard = useMemo(() => {
    if (!activeDimensionType) {
      return card;
    }

    return {
      ...card,
      display: DEFAULT_DISPLAY_TYPE_BY_DIMENSION[activeDimensionType],
      visualization_settings: {
        "graph.x_axis.title_text": "",
      },
    };
  }, [card, activeDimensionType]);

  // Time series → show value + change over time. Keyed off result columns, not the
  // Lib metric definition, so metrics defined on models (name-based breakout refs) work too.
  const cols = data?.data.cols;
  const isTimeSeries = isDate(cols?.[0]) && isNumeric(cols?.[1]);

  return {
    activeDimensionId,
    data,
    dimensionOptions,
    isLoading,
    isTimeSeries,
    visualizationCard,
  };
}
