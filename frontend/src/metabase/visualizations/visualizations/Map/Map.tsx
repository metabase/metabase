import { Suspense, lazy, memo } from "react";

import { Flex } from "metabase/ui";
import MapSkeleton from "metabase/visualizations/components/skeletons/MapSkeleton/MapSkeleton";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";

import { MAP_VIZ_DEFINITION } from "./definition";

// Leaflet (and the map renderer that uses it) is loaded lazily so it stays out
// of the initial bundle for the majority of users who never open a map.
const MapRenderer = lazy(() =>
  import(/* webpackChunkName: "map-renderer" */ "./MapRenderer").then(
    (module) => ({ default: module.MapRenderer }),
  ),
);

function MapComponent(props: VisualizationProps) {
  return (
    <Suspense
      fallback={
        <Flex h="100%" w="100%" direction="column">
          <MapSkeleton />
        </Flex>
      }
    >
      <MapRenderer {...props} />
    </Suspense>
  );
}

function arePropsEqual(prev: VisualizationProps, next: VisualizationProps) {
  const sameSize = prev.width === next.width && prev.height === next.height;
  const sameSeries = isSameSeries(prev.series, next.series);
  const sameIsEditing = prev.isEditing === next.isEditing;
  const sameHighlighted = prev.highlighted === next.highlighted;

  return sameSize && sameSeries && sameIsEditing && sameHighlighted;
}

export const Map = Object.assign(
  memo(MapComponent, arePropsEqual),
  MAP_VIZ_DEFINITION,
);
