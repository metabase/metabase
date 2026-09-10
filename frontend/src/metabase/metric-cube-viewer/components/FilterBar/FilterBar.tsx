import { useMemo } from "react";

import type { DimensionFilterValue } from "metabase/common/metrics-viewer";
import { Group } from "metabase/ui";
import type { SegmentId } from "metabase-types/api";

import { useMetricCubeViewerContext } from "../../context";
import type { CubeDimension, CubeDimensionKey } from "../../types";
import {
  type ReferenceFilterDimension,
  findReferenceFilterDimension,
} from "../../utils/reference-definition";

import { DimensionFilterPill } from "./DimensionFilterPill";
import { SegmentFilterPill } from "./SegmentFilterPill";

interface FilterableDimension {
  dimension: CubeDimension;
  reference: ReferenceFilterDimension;
}

export function FilterBar() {
  const { catalog, definitions, state, actions } = useMetricCubeViewerContext();
  const { filters } = state;

  const filterableDimensions = useMemo(
    () =>
      state.settings.filterDimensionKeys.flatMap(
        (key): FilterableDimension[] => {
          const dimension = catalog.dimensions.find((d) => d.key === key);
          const reference = findReferenceFilterDimension(
            catalog,
            definitions,
            key,
          );
          return dimension && reference ? [{ dimension, reference }] : [];
        },
      ),
    [state.settings.filterDimensionKeys, catalog, definitions],
  );

  const hasSegments = catalog.segments.length > 0;
  if (!hasSegments && filterableDimensions.length === 0) {
    return null;
  }

  const handleSegmentsChange = (segmentIds: SegmentId[]) => {
    actions.setFilters({ ...filters, segmentIds });
  };

  const handleDimensionFilterChange = (
    dimensionKey: CubeDimensionKey,
    value: DimensionFilterValue,
  ) => {
    const others = filters.dimensionFilters.filter(
      (filter) => filter.dimensionKey !== dimensionKey,
    );
    actions.setFilters({
      ...filters,
      dimensionFilters: [...others, { dimensionKey, value }],
    });
  };

  const handleDimensionFilterClear = (dimensionKey: CubeDimensionKey) => {
    actions.setFilters({
      ...filters,
      dimensionFilters: filters.dimensionFilters.filter(
        (filter) => filter.dimensionKey !== dimensionKey,
      ),
    });
  };

  return (
    <Group gap="sm" wrap="wrap" data-testid="cube-filter-bar">
      {hasSegments && (
        <SegmentFilterPill
          segments={catalog.segments}
          selectedSegmentIds={filters.segmentIds}
          onChange={handleSegmentsChange}
        />
      )}
      {filterableDimensions.map(({ dimension, reference }) => (
        <DimensionFilterPill
          key={dimension.key}
          dimension={dimension}
          reference={reference}
          value={
            filters.dimensionFilters.find(
              (filter) => filter.dimensionKey === dimension.key,
            )?.value
          }
          onChange={(value) =>
            handleDimensionFilterChange(dimension.key, value)
          }
          onClear={() => handleDimensionFilterClear(dimension.key)}
        />
      ))}
    </Group>
  );
}
