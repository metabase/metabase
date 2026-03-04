import L from "leaflet";
import _ from "underscore";

import { getSubpathSafeUrl } from "metabase/lib/urls";
import type { HoveredObject } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import {
  LeafletMap,
  type LeafletMapPoint,
  type LeafletMapProps,
} from "./LeafletMap";

type IndexedPoint = LeafletMapPoint<[number]>;

interface LeafletMarkerPinMapProps extends LeafletMapProps<IndexedPoint> {
  onHoverChange?: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick?: (clickObject: ClickObject | null) => void;
}

export class LeafletMarkerPinMap extends LeafletMap<LeafletMarkerPinMapProps> {
  pinMarkerLayer: L.LayerGroup | null = null;
  pinMarkerIcon: L.Icon | null = null;

  componentDidMount() {
    super.componentDidMount();

    if (!this.map) {
      return;
    }

    this.pinMarkerLayer = L.layerGroup([]).addTo(this.map);
    this.pinMarkerIcon = L.icon({
      iconUrl: getSubpathSafeUrl("app/assets/img/pin.png"),
      iconSize: [28, 32],
      iconAnchor: [15, 24],
      popupAnchor: [0, -13],
    });

    this.syncMarkerLayer();
  }

  componentDidUpdate(prevProps: LeafletMarkerPinMapProps) {
    super.componentDidUpdate(prevProps);
    this.syncMarkerLayer();
  }

  private syncMarkerLayer() {
    try {
      this._createMarkers(this.props.points);
    } catch (err) {
      console.error(err);
      this.props.onRenderError(
        err instanceof Error ? err.message : (err ?? undefined),
      );
    }
  }

  _createMarkers = (points?: IndexedPoint[] | null) => {
    const { pinMarkerLayer } = this;
    if (!this.map || !pinMarkerLayer || !points) {
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

    const wrappedPoints: IndexedPoint[] = shouldGetWrappedPoints
      ? points.flatMap((point, index) => {
          const [lat, lng] = point;
          // we need to store the data index separately
          // because the same point can have multiple markers
          const wrapped: IndexedPoint[] = [[lat, lng, index]];

          // note: for wide screens, we may need extra copies on both sides
          if (crossesLeftDateline) {
            // copy on the left side
            wrapped.push([lat, lng - 360, index]);
          }

          if (crossesRightDateline) {
            // copy on the right side
            wrapped.push([lat, lng + 360, index]);
          }
          return wrapped;
        })
      : points;

    const markers = pinMarkerLayer.getLayers() as L.Marker[];
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
          markers[i].setLatLng([wrappedPoints[i][0], wrappedPoints[i][1]]);
          // we need to re-attach the pointer events because the indexes might have changed from zooming
          this._setupMarkerEvents(markers[i], index);
        }
      }
    }
  };

  _createMarker = (rowIndex: number) => {
    const marker = L.marker([0, 0], {
      ...(this.pinMarkerIcon ? { icon: this.pinMarkerIcon } : {}),
    });
    return this._setupMarkerEvents(marker, rowIndex);
  };

  _setupMarkerEvents = (marker: L.Marker, rowIndex: number) => {
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
      const hover: HoveredObject = {
        dimensions: cols.map((col, colIndex) => ({
          value: String(rows[rowIndex][colIndex] ?? ""),
          column: col,
        })),
        element: (marker as unknown as { _icon: HTMLElement })._icon,
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
        column: hasPk ? cols[pkIndex] : undefined,
        element: (marker as unknown as { _icon: HTMLElement })._icon,
        origin: { row: rows[rowIndex], cols },
        settings,
        data,
      });
    });

    return marker;
  };
}
