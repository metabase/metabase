import "leaflet/dist/leaflet.css";
import type { Feature } from "geojson";
import L from "leaflet";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/ui/utils/colors";
import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";
import type { GeoJSONData, Series } from "metabase-types/api";

import { CardRenderer } from "./CardRenderer";

type FeatureInteraction = {
  feature: Feature;
  event: MouseEvent;
};

interface LeafletChoroplethProps {
  series?: Series;
  geoJson?: GeoJSONData;
  minimalBounds?: L.LatLngBounds;
  getColor?: (feature: Feature) => string;
  onHoverFeature?: (payload: FeatureInteraction | null) => void;
  onClickFeature?: (payload: FeatureInteraction) => void;
  onRenderError?: (error?: unknown) => void;
}

export const LeafletChoropleth = ({
  series = [],
  geoJson,
  minimalBounds = geoJson
    ? computeMinimalBounds(
        "features" in geoJson && Array.isArray(geoJson.features)
          ? geoJson.features
          : [geoJson],
      )
    : undefined,
  getColor = () => color("brand"),
  onHoverFeature = () => {},
  onClickFeature = () => {},
  onRenderError = () => {},
}: LeafletChoroplethProps) => (
  <CardRenderer
    card={{ display: "map" }}
    series={series}
    className={CS.spread}
    renderer={(element: HTMLElement) => {
      element.className = CS.spread;
      element.style.backgroundColor = "transparent";

      const map = L.map(element, {
        attributionControl: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        trackResize: true,
        worldCopyJump: true,
        zoomAnimation: false,
        zoomSnap: 0,

        // disable zoom controls
        dragging: false,
        tap: false,
        zoomControl: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      const style = (feature?: Feature): L.PathOptions => ({
        fillColor: feature ? getColor(feature) : color("brand"),
        weight: 1,
        opacity: 1,
        color: "white",
        fillOpacity: 1,
      });

      const onEachFeature = (feature: Feature, layer: L.Layer) => {
        layer.on({
          mousemove: (e: L.LeafletMouseEvent) => {
            onHoverFeature({
              feature,
              event: e.originalEvent,
            });
          },
          mouseout: () => {
            onHoverFeature(null);
          },
          click: (e: L.LeafletMouseEvent) => {
            onClickFeature({
              feature,
              event: e.originalEvent,
            });
          },
        });
      };

      if (geoJson) {
        // main layer
        L.featureGroup([
          L.geoJSON(geoJson, {
            style,
            onEachFeature,
          }),
        ]).addTo(map);
      }

      if (minimalBounds) {
        map.fitBounds(minimalBounds);
      }

      return () => {
        map.remove();
      };
    }}
    onRenderError={onRenderError}
  />
);
