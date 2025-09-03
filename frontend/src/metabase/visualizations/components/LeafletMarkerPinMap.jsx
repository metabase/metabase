import L from "leaflet";

import { getSubpathSafeUrl } from "metabase/lib/urls";

import LeafletMap from "./LeafletMap";

export default class LeafletMarkerPinMap extends LeafletMap {
  componentDidMount() {
    super.componentDidMount();

    this.pinMarkerLayer = L.layerGroup([]).addTo(this.map);
    this.pinMarkerIcon = L.icon({
      iconUrl: getSubpathSafeUrl("app/assets/img/pin.png"),
      iconSize: [28, 32],
      iconAnchor: [15, 24],
      popupAnchor: [0, -13],
    });

    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    super.componentDidUpdate(prevProps, prevState);

    try {
      this._createMarkers(this.props.points);
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  _createMarkers = (points) => {
    const { pinMarkerLayer } = this;
    if (!this.map) {
      return;
    }

    const mapBounds = this.map?.getBounds?.();
    if (!mapBounds) {
      return;
    }
    const mapWest = mapBounds.getWest();
    const mapEast = mapBounds.getEast();

    // if map crosses dateline, we need wrapping
    const crossesLeftDateline = mapWest < -180 && mapEast > -180;
    const crossesRightDateline = mapWest < 180 && mapEast > 180;
    const shouldGetWrappedPoints = crossesLeftDateline || crossesRightDateline;

    const wrappedPoints = shouldGetWrappedPoints
      ? points.flatMap((point, index) => {
          const [lat, lng] = point;
          // we need to store the data index separately
          // because the same point can have multiple markers
          const points = [[lat, lng, index]];

          // note: for wide screens, we may need extra copies on both sides
          if (crossesLeftDateline) {
            // copy on the left side
            points.push([lat, lng - 360, index]);
          }

          if (crossesRightDateline) {
            // copy on the right side
            points.push([lat, lng + 360, index]);
          }
          return points;
        })
      : points;

    const markers = pinMarkerLayer.getLayers();
    const max = Math.max(wrappedPoints.length, markers.length);
    for (let i = 0; i < max; i++) {
      if (i >= wrappedPoints.length) {
        pinMarkerLayer.removeLayer(markers[i]); // remove excess markers
      }
      if (i >= markers.length) {
        // create new markers for new points
        const index = shouldGetWrappedPoints ? wrappedPoints[i][2] : i;

        const marker = this._createMarker(index);
        pinMarkerLayer.addLayer(marker);
        markers.push(marker);
      }

      if (i < wrappedPoints.length) {
        const { lat, lng } = markers[i].getLatLng();
        // if any marker doesn't match the point, update it
        if (lng !== wrappedPoints[i][0] || lat !== wrappedPoints[i][1]) {
          markers[i].setLatLng(wrappedPoints[i].slice(0, 2));
        }
      }
    }
  };
}
