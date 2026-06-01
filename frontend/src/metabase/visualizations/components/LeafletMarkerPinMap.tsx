import L from "leaflet";
import _ from "underscore";

import { getSubpathSafeUrl } from "metabase/urls";
import { animateMentionHighlightContract } from "metabase/visualizations/lib/mention-highlight";
import type { HoveredObject } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import {
  LeafletMap,
  type LeafletMapPoint,
  type LeafletMapProps,
  MAP_SELECTION_DURATION,
  getClickedRowIndex,
} from "./LeafletMap";

type IndexedPoint = LeafletMapPoint<[number]>;

interface LeafletMarkerPinMapProps extends LeafletMapProps<IndexedPoint> {
  onHoverChange?: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick?: (clickObject: ClickObject | null) => void;
}

export class LeafletMarkerPinMap extends LeafletMap<LeafletMarkerPinMapProps> {
  pinMarkerLayer: L.LayerGroup | null = null;
  pinMarkerIcon: L.Icon | null = null;
  selectionTimeoutId: number | null = null;

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
    this.syncSelectionLayer();
  }

  componentDidUpdate(prevProps: LeafletMarkerPinMapProps) {
    super.componentDidUpdate(prevProps);
    this.syncMarkerLayer();
    if (
      prevProps.clicked !== this.props.clicked ||
      prevProps.clickedViaMention !== this.props.clickedViaMention ||
      prevProps.points !== this.props.points
    ) {
      this.syncSelectionLayer();
    }
  }

  componentWillUnmount() {
    if (this.selectionTimeoutId != null) {
      window.clearTimeout(this.selectionTimeoutId);
    }
    super.componentWillUnmount();
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

    const markers = pinMarkerLayer
      .getLayers()
      .filter((layer): layer is L.Marker => layer instanceof L.Marker);
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

      (
        markers[i] as L.Marker & { _metabaseRowIndex?: number }
      )._metabaseRowIndex = index;

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
    (marker as L.Marker & { _metabaseRowIndex?: number })._metabaseRowIndex =
      rowIndex;
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
        element: marker.getElement(),
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
        element: marker.getElement(),
        origin: { row: rows[rowIndex], cols },
        settings,
        data,
      });
    });

    return marker;
  };

  private syncSelectionLayer() {
    if (this.selectionTimeoutId != null) {
      window.clearTimeout(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
    }

    const markers = this.pinMarkerLayer
      ?.getLayers()
      .filter((layer): layer is L.Marker => layer instanceof L.Marker);
    if (!markers) {
      return;
    }

    const rows = this.props.series[0].data.rows;
    const selectedRowIndex = getClickedRowIndex(
      rows,
      this.props.clickedViaMention ?? this.props.clicked,
    );
    this.applyMarkerSelection(
      markers,
      selectedRowIndex,
      this.props.clickedViaMention != null,
    );

    if (selectedRowIndex != null) {
      this.selectionTimeoutId = window.setTimeout(() => {
        this.applyMarkerSelection(markers, null, false);
        this.selectionTimeoutId = null;
      }, MAP_SELECTION_DURATION);
    }
  }

  private applyMarkerSelection(
    markers: L.Marker[],
    selectedRowIndex: number | null,
    selectedViaMention: boolean,
  ) {
    for (const marker of markers) {
      const element = marker.getElement();
      if (!element) {
        continue;
      }

      const rowIndex = (marker as L.Marker & { _metabaseRowIndex?: number })
        ._metabaseRowIndex;
      const isSelected =
        selectedRowIndex != null && rowIndex === selectedRowIndex;

      element.style.opacity =
        selectedRowIndex == null || isSelected ? "" : "0.3";
      element.style.filter = isSelected
        ? "drop-shadow(0 0 6px var(--mb-color-brand))"
        : "";
      element.style.zIndex = isSelected ? "1000" : "";

      if (isSelected && selectedViaMention) {
        animateMentionHighlightContract(element);
      }
    }
  }
}
