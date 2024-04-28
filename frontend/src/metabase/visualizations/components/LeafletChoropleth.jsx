/* eslint-disable react/prop-types */
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";

import CardRenderer from "./CardRenderer";

const LeafletChoropleth = ({
  series = [],
  geoJson,
  minimalBounds = computeMinimalBounds(geoJson.features || [geoJson]),
  getColor = () => color("brand"),
  onHoverFeature = () => {},
  onClickFeature = () => {},
  onRenderError = () => {},
}) => (
  <CardRenderer
    card={{ display: "map" }}
    series={series}
    className={CS.spread}
    renderer={(element, props) => {
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
              feature,
              event: e.originalEvent,
            });
          },
          mouseout: e => {
            onHoverFeature(null);
          },
          click: e => {
            onClickFeature({
              feature,
              event: e.originalEvent,
            });
          },
        });
      };

      // main layer
      L.featureGroup([
        L.geoJson(geoJson, {
          style,
          onEachFeature,
        }),
      ]).addTo(map);

      map.fitBounds(minimalBounds);

      return () => {
        map.remove();
      };
    }}
    onRenderError={onRenderError}
  />
);

export default LeafletChoropleth;
