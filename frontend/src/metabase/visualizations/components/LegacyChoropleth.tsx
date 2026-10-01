import cx from "classnames";
import * as d3 from "d3";
import type { Feature, FeatureCollection } from "geojson";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import { isSameSeries } from "metabase/viz-core";
import type { Series } from "metabase-types/api";

import type { FeatureInteraction } from "./LeafletChoropleth";

type LngLat = [lng: number, lat: number];

export type ProjectionFrame = [topLeft: LngLat, bottomRight: LngLat];

interface LegacyChoroplethProps {
  series: Series;
  geoJson: FeatureCollection;
  projection: d3.GeoProjection;
  projectionFrame: ProjectionFrame;
  getColor: (feature: Feature) => string;
  isFeatureHighlighted: (feature: Feature) => boolean | null;
  highlightedKey: string | null;
  onHoverFeature?: (payload: FeatureInteraction | null) => void;
  onClickFeature?: (payload: FeatureInteraction) => void;
}

export const LegacyChoropleth = memo(
  function LegacyChoropleth({
    geoJson,
    projection,
    projectionFrame,
    getColor,
    isFeatureHighlighted,
    onHoverFeature,
    onClickFeature,
  }: LegacyChoroplethProps) {
    const geo = d3.geoPath().projection(projection);

    const [[minX, minY], [maxX, maxY]] = projectionFrame.map((coord) => {
      const projected = projection(coord);
      return projected ?? [0, 0];
    });
    const width = maxX - minX;
    const height = maxY - minY;

    return (
      <div
        className={cx(
          CS.absolute,
          CS.top,
          CS.bottom,
          CS.left,
          CS.right,
          CS.flex,
          CS.layoutCentered,
        )}
      >
        <svg
          className={cx(CS.flexFull, CS.m1)}
          viewBox={`${minX} ${minY} ${width} ${height}`}
        >
          {geoJson.features.map((feature, index) => {
            const opacity = isFeatureHighlighted(feature) === false ? 0.3 : 1;

            return (
              <path
                data-testid="choropleth-feature"
                key={index}
                d={geo(feature) ?? undefined}
                stroke="white"
                strokeWidth={1}
                fill={getColor(feature)}
                opacity={opacity}
                style={{ transition: "opacity 0.15s ease" }}
                onMouseMove={(e) =>
                  onHoverFeature?.({
                    feature,
                    event: e.nativeEvent,
                  })
                }
                onMouseLeave={() => onHoverFeature?.(null)}
                className={cx({ [CS.cursorPointer]: Boolean(onClickFeature) })}
                onClick={
                  onClickFeature
                    ? (e) =>
                        onClickFeature({
                          feature,
                          event: e.nativeEvent,
                        })
                    : undefined
                }
              />
            );
          })}
        </svg>
      </div>
    );
  },
  // FIXME: verify if we really need memoization here
  (prevProps, nextProps) =>
    isSameSeries(prevProps.series, nextProps.series) &&
    prevProps.highlightedKey === nextProps.highlightedKey,
);
