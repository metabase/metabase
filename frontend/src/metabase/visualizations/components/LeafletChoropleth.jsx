import React from "react";

import { color } from "metabase/lib/colors";

import CardRenderer from "./CardRenderer";

// import L from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";

const LeafletChoropleth = ({
  series,
  geoJson,
  minimalBounds = computeMinimalBounds(geoJson.features),
  getColor = () => color("brand"),
  onHoverFeature = () => {},
  onClickFeature = () => {},
  onRenderError,
}) => (
  <CardRenderer
    series={series}
    className="spread"
    renderer={(element, props) => {
      element.className = "spread";
      element.style.backgroundColor = "transparent";

      const map = L.map(element, {
        zoomSnap: 0,
        worldCopyJump: true,
        attributionControl: false,

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

      const style = feature => ({
        fillColor: getColor(feature),
        weight: 1,
        opacity: 1,
        color: "white",
        fillOpacity: 1,
      });

      const onEachFeature = (feature, layer) => {
        layer.on({
          mousemove: e => {
            onHoverFeature({
              feature: feature,
              event: e.originalEvent,
            });
          },
          mouseout: e => {
            onHoverFeature(null);
          },
          click: e => {
            onClickFeature({
              feature: feature,
              event: e.originalEvent,
            });
          },
        });
      };

      // main layer
      L.featureGroup([
        L.geoJson(geoJson, {
          style: style,
          onEachFeature: onEachFeature,
        }),
      ]).addTo(map);

      // left and right duplicates so we can pan a bit
      L.featureGroup([
        L.geoJson(geoJson, {
          style: style,
          onEachFeature: onEachFeature,
          coordsToLatLng: ([longitude, latitude]) =>
            L.latLng(latitude, longitude - 360),
        }),
        L.geoJson(geoJson, {
          style: style,
          onEachFeature: onEachFeature,
          coordsToLatLng: ([longitude, latitude]) =>
            L.latLng(latitude, longitude + 360),
        }),
      ]).addTo(map);

      map.fitBounds(minimalBounds);
      // map.fitBounds(geoFeatureGroup.getBounds());

      return () => {
        map.remove();
      };
    }}
    onRenderError={onRenderError}
  />
);

export default LeafletChoropleth;
