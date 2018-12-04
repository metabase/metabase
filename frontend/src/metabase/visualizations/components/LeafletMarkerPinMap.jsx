import LeafletMap from "./LeafletMap.jsx";
import L from "leaflet";

import { isPK } from "metabase/lib/schema_metadata";

import _ from "underscore";

const MARKER_ICON = L.icon({
  iconUrl: "app/assets/img/pin.png",
  iconSize: [28, 32],
  iconAnchor: [15, 24],
  popupAnchor: [0, -13],
});

export default class LeafletMarkerPinMap extends LeafletMap {
  componentDidMount() {
    super.componentDidMount();

    this.pinMarkerLayer = L.layerGroup([]).addTo(this.map);
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    super.componentDidUpdate(prevProps, prevState);

    try {
      const { pinMarkerLayer } = this;
      const { points } = this.props;

      let markers = pinMarkerLayer.getLayers();
      let max = Math.max(points.length, markers.length);
      for (let i = 0; i < max; i++) {
        if (i >= points.length) {
          pinMarkerLayer.removeLayer(markers[i]);
        }
        if (i >= markers.length) {
          const marker = this._createMarker(i);
          pinMarkerLayer.addLayer(marker);
          markers.push(marker);
        }

        if (i < points.length) {
          const { lat, lng } = markers[i].getLatLng();
          if (lng !== points[i][0] || lat !== points[i][1]) {
            markers[i].setLatLng(points[i]);
          }
        }
      }
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  _createMarker = rowIndex => {
    const marker = L.marker([0, 0], { icon: MARKER_ICON });
    const { onHoverChange, onVisualizationClick } = this.props;
    if (onHoverChange) {
      marker.on("mousemove", e => {
        const { series: [{ data: { cols, rows } }] } = this.props;
        const hover = {
          dimensions: cols.map((col, colIndex) => ({
            value: rows[rowIndex][colIndex],
            column: col,
          })),
          element: marker._icon,
        };
        onHoverChange(hover);
      });
      marker.on("mouseout", () => {
        onHoverChange(null);
      });
    }
    if (onVisualizationClick) {
      marker.on("click", () => {
        const { series: [{ data: { cols, rows } }] } = this.props;
        const pkIndex = _.findIndex(cols, isPK);
        if (pkIndex >= 0) {
          // if there's a PK just use that for now
          onVisualizationClick({
            value: rows[rowIndex][pkIndex],
            column: cols[pkIndex],
            element: marker._icon,
          });
        }
      });
    }
    return marker;
  };
}
