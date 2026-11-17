import { useMemo } from "react";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type {
  AvailableDimension,
  AvailableDimensionsResult,
  MetricSourceId,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/types";
import type { DimensionPickerSection } from "metabase/metrics-viewer/utils";

export function useDimensionPickerSidebarSections(): DimensionPickerSection[] {
  const {
    sidebarAvailableDimensions: availableDimensions,
    sourceOrder,
    sourceDataById,
  } = useMetricsViewerContext();

  return useMemo(
    () =>
      getDimensionPickerSidebarSections(
        availableDimensions,
        sourceOrder,
        sourceDataById,
      ),
    [availableDimensions, sourceDataById, sourceOrder],
  );
}

function getDimensionPickerSidebarSections(
  availableDimensions: AvailableDimensionsResult,
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>,
) {
  const sections: DimensionPickerSection[] = [];

  const pushSection = (
    dimensions: AvailableDimension[],
    name?: string,
    options: { isShared?: boolean; sourceId?: MetricSourceId } = {},
  ) => {
    if (dimensions.length === 0) {
      return;
    }
    sections.push({
      name,
      ...options,
      items: dimensions.map((dimension) => ({
        ...dimension,
        name: dimension.dimensionBreakoutInfo.label,
      })),
    });
  };

  const hasMultipleSources = sourceOrder.length > 1;

  if (hasMultipleSources) {
    pushSection(availableDimensions.shared, t`Shared`, { isShared: true });
  }

  for (const sourceId of sourceOrder) {
    const sourceDimensions = availableDimensions.bySource[sourceId] ?? [];

    if (hasMultipleSources) {
      const sourceName = sourceDataById[sourceId]?.name ?? sourceId;
      pushSection(sourceDimensions, sourceName, { sourceId });
    } else {
      pushSection(sourceDimensions);
    }
  }

  return sections;
}
