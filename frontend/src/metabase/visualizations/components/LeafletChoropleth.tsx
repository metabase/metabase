import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/ui/utils/colors";
import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";
import { animateMentionHighlightStroke } from "metabase/visualizations/lib/mention-highlight";
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
  getFeatureKey?: (feature: Feature) => string;
  onHoverFeature?: (payload: FeatureInteraction | null) => void;
  onClickFeature?: (payload: FeatureInteraction) => void;
  onRenderError?: (error?: unknown) => void;
  selectedFeatureKey?: string | null;
  selectedFeatureViaMention?: boolean;
}

function isFeatureCollection(value: GeoJSONData): value is FeatureCollection {
  return value.type === "FeatureCollection";
}

export const LeafletChoropleth = ({
  series = [],
  geoJson,
  minimalBounds = geoJson
    ? computeMinimalBounds(
        isFeatureCollection(geoJson) ? geoJson.features : [geoJson],
      )
    : undefined,
  getColor = () => color("brand"),
  getFeatureKey = () => "",
  onHoverFeature = () => {},
  onClickFeature = () => {},
  onRenderError = () => {},
  selectedFeatureKey = null,
  selectedFeatureViaMention = false,
}: LeafletChoroplethProps) => (
  <CardRenderer
    card={{ display: "map" }}
    series={series}
    selectedFeatureKey={selectedFeatureKey}
    selectedFeatureViaMention={selectedFeatureViaMention}
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

      const style = (feature?: Feature): L.PathOptions => {
        const isSelected =
          feature && selectedFeatureKey === getFeatureKey(feature);
        const hasSelection = selectedFeatureKey != null;

        return {
          fillColor: feature ? getColor(feature) : color("brand"),
          weight: isSelected ? 3 : 1,
          opacity: hasSelection && !isSelected ? 0.3 : 1,
          color:
            isSelected && selectedFeatureViaMention
              ? "var(--mb-color-brand)"
              : "white",
          fillOpacity: hasSelection && !isSelected ? 0.25 : 1,
        };
      };

      let mentionSelectedLayer: L.Layer | null = null;

      const onEachFeature = (feature: Feature, layer: L.Layer) => {
        if (
          selectedFeatureViaMention &&
          selectedFeatureKey === getFeatureKey(feature)
        ) {
          mentionSelectedLayer = layer;
        }
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

      // Once the selected region's path is in the DOM, play the "contract onto
      // the region" animation by tightening its stroke from thick to resting.
      const mentionAnimationFrame = window.requestAnimationFrame(() => {
        const path = (mentionSelectedLayer as L.Path | null)?.getElement?.();
        if (path instanceof SVGElement) {
          animateMentionHighlightStroke(path, 3);
        }
      });

      return () => {
        window.cancelAnimationFrame(mentionAnimationFrame);
        map.remove();
      };
    }}
    onRenderError={onRenderError}
  />
);
