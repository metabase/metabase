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

export function useMetricAboutQuery(card: Card) {
  const { data: metric, isLoading: isLoadingMetric } = useGetMetricQuery(
    card.id,
  );
  const { definition } = useMetricDefinition(card.id);

  const defaultDimensionId =
    metric?.dimensions.find(
      (dimension) =>
        dimension.default && dimension.status !== "status/orphaned",
    )?.id ?? null;

  const defaultDimensionType =
    definition && defaultDimensionId
      ? (getDimensionDescriptors(definition).get(defaultDimensionId)
          ?.dimensionType ?? null)
      : null;

  const isWaitingForDefinition = defaultDimensionId != null && !definition;
  const useDefaultDimension = defaultDimensionType != null;
  const { data: dimensionData, isLoading: isLoadingDimension } =
    useMetricDimensionQuery(
      definition,
      useDefaultDimension ? defaultDimensionId : null,
    );
  const { data: cardData, isLoading: isLoadingCard } = useCardQueryData(card, {
    skip: isLoadingMetric || isWaitingForDefinition || useDefaultDimension,
  });

  const data = useDefaultDimension ? dimensionData : cardData;
  const isLoading =
    isLoadingMetric ||
    isWaitingForDefinition ||
    (useDefaultDimension ? isLoadingDimension : isLoadingCard);

  const visualizationCard = useMemo(() => {
    if (!defaultDimensionType) {
      return card;
    }

    return {
      ...card,
      display: DEFAULT_DISPLAY_TYPE_BY_DIMENSION[defaultDimensionType],
      visualization_settings: {},
    };
  }, [card, defaultDimensionType]);

  // Time series → show value + change over time. Keyed off result columns, not the
  // Lib metric definition, so metrics defined on models (name-based breakout refs) work too.
  const cols = data?.data.cols;
  const isTimeSeries = isDate(cols?.[0]) && isNumeric(cols?.[1]);

  return { data, isLoading, isTimeSeries, visualizationCard };
}
