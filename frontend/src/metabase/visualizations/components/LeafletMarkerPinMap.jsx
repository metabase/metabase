import L from "leaflet";
import _ from "underscore";

import { getSubpathSafeUrl } from "metabase/lib/urls";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import { LeafletMap } from "./LeafletMap";

export class LeafletMarkerPinMap extends LeafletMap {
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
        continue;
      }

      const index =
        wrappedPoints.length > points.length ? wrappedPoints[i][2] : i;
      if (i >= markers.length) {
        // create new markers for new points
        const marker = this._createMarker(index);
        pinMarkerLayer.addLayer(marker);
        markers.push(marker);
      }

      if (i < wrappedPoints.length) {
        const { lat, lng } = markers[i].getLatLng();
        // if any marker doesn't match the point, update it
        if (lng !== wrappedPoints[i][0] || lat !== wrappedPoints[i][1]) {
          markers[i].setLatLng(wrappedPoints[i].slice(0, 2));
          // we need to re-attach the pointer events because the indexes might have changed from zooming
          this._setupMarkerEvents(markers[i], index);
        }
      }
    }
  };

  _createMarker = (rowIndex) => {
    const marker = L.marker([0, 0], { icon: this.pinMarkerIcon });
    return this._setupMarkerEvents(marker, rowIndex);
  };

  _setupMarkerEvents = (marker, rowIndex) => {
    marker.off("mousemove");
    marker.off("mouseout");
    marker.off("click");
    marker.on("mousemove", () => {
      const { onHoverChange } = this.props;
      if (!onHoverChange) {
        return;
      }
      const {
        series: [
          {
            data: { cols, rows },
          },
        ],
      } = this.props;
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
      const { onHoverChange } = this.props;
      onHoverChange?.(null);
    });

    marker.on("click", () => {
      const { onVisualizationClick, settings } = this.props;
      if (!onVisualizationClick) {
        return;
      }
      const {
        series: [
          {
            data: { cols, rows },
          },
        ],
      } = this.props;
      // if there is a primary key then associate a pin with it
      const pkIndex = _.findIndex(cols, isPK);
      const hasPk = pkIndex >= 0;

      const data = cols.map((col, index) => ({
        col,
        value: rows[rowIndex][index],
      }));

      onVisualizationClick({
        value: hasPk ? rows[rowIndex][pkIndex] : null,
        column: hasPk ? cols[pkIndex] : null,
        element: marker._icon,
        origin: { row: rows[rowIndex], cols },
        settings,
        data,
      });
    });

    return marker;
  };
}
