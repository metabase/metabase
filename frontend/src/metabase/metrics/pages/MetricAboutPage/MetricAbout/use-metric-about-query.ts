import { useMemo } from "react";

import {
  skipToken,
  useGetMetricDatasetQuery,
  useGetMetricQuery,
} from "metabase/api";
import { getDimensionDescriptors } from "metabase/common/metrics/utils/dimension-descriptors";
import { DEFAULT_DISPLAY_TYPE_BY_DIMENSION } from "metabase/common/metrics/utils/dimension-types";
import { getDimensionIcon } from "metabase/common/metrics/utils/dimensions";
import {
  useMetricDefinition,
  useMetricDimensionQuery,
} from "metabase/metrics/common/hooks";
import * as LibMetric from "metabase-lib/metric";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";

export function useMetricAboutQuery(
  card: Card,
  selectedDimensionId: string | null,
) {
  const { data: metric, isLoading: isLoadingMetric } = useGetMetricQuery(
    card.id,
  );
  const { definition, isLoading: isLoadingDefinition } = useMetricDefinition(
    card.id,
  );

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

      return [
        {
          value: dimension.id,
          label: descriptor.displayName,
          icon: getDimensionIcon(descriptor.dimensionMetadata),
        },
      ];
    }) ?? [];
  const activeDimensionId = selectedDimensionId ?? defaultDimensionId;

  const activeDimensionType =
    activeDimensionId && dimensionDescriptors
      ? (dimensionDescriptors.get(activeDimensionId)?.dimensionType ?? null)
      : null;

  const useDimension = activeDimensionType != null;
  const useScalar = metric != null && !useDimension;
  const isWaitingForDefinition = metric != null && !definition;
  const { data: dimensionData, isLoading: isLoadingDimension } =
    useMetricDimensionQuery(
      definition,
      useDimension ? activeDimensionId : null,
    );
  const scalarRequest = useMemo(() => {
    if (!useScalar || !definition) {
      return null;
    }

    return { definition: LibMetric.toJsMetricDefinition(definition) };
  }, [definition, useScalar]);
  const { data: scalarData, isLoading: isLoadingScalar } =
    useGetMetricDatasetQuery(scalarRequest ?? skipToken);
  const data = useDimension ? dimensionData : scalarData;
  const activeDimensionLabel = dimensionOptions.find(
    (option) => option.value === activeDimensionId,
  )?.label;
  const activeDimensionSelectLabel =
    activeDimensionType === "numeric"
      ? (data?.data.cols[0]?.display_name ?? activeDimensionLabel)
      : activeDimensionLabel;
  const isLoading =
    isLoadingMetric ||
    isWaitingForDefinition ||
    (useDimension && isLoadingDimension) ||
    (useScalar && (isLoadingDefinition || isLoadingScalar));

  const visualizationCard = useMemo(() => {
    if (!activeDimensionType) {
      return {
        ...card,
        display: "scalar" as const,
        visualization_settings: {},
      };
    }

    return {
      ...card,
      display: DEFAULT_DISPLAY_TYPE_BY_DIMENSION[activeDimensionType],
      visualization_settings: {
        "graph.x_axis.labels_enabled": false,
      },
    };
  }, [card, activeDimensionType]);

  // Time series → show value + change over time. Keyed off result columns, not the
  // Lib metric definition, so metrics defined on models (name-based breakout refs) work too.
  const cols = data?.data.cols;
  const isTimeSeries = isDate(cols?.[0]) && isNumeric(cols?.[1]);

  return {
    activeDimensionId,
    activeDimensionSelectLabel,
    data,
    dimensionOptions,
    isLoading,
    isTimeSeries,
    visualizationCard,
  };
}
