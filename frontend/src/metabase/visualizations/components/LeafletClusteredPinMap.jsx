import L from "leaflet";
import _ from "underscore";
// Import markercluster to extend L
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { getSubpathSafeUrl } from "metabase/lib/urls";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import LeafletMap from "./LeafletMap";

export default class LeafletClusteredPinMap extends LeafletMap {
  componentDidMount() {
    super.componentDidMount();

    try {
      if (!L.markerClusterGroup) {
        throw new Error(
          "Map clustering feature is not available. Please contact your administrator.",
        );
      }

      const { settings } = this.props;
      // Use settings with fallback to defaults
      const clusterRadius = settings?.["map.cluster_radius"] ?? 50;
      const maxZoom = settings?.["map.cluster_max_zoom"] ?? 18;

      this.pinMarkerLayer = L.markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 200,
        chunkDelay: 50,
        maxClusterRadius: clusterRadius,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        animate: true,
        disableClusteringAtZoom: maxZoom,
      }).addTo(this.map);

      this.pinMarkerIcon = L.icon({
        iconUrl: getSubpathSafeUrl("app/assets/img/pin.png"),
        iconSize: [28, 32],
        iconAnchor: [15, 24],
        popupAnchor: [0, -13],
      });

      // Initialize markers
      this._createMarkers(this.props.points);
    } catch (err) {
      console.error("Error initializing clustered pin map:", err);
      this.props.onRenderError && this.props.onRenderError(err.message || err);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    super.componentDidUpdate(prevProps, prevState);

    // Compare cluster-related settings to enable dynamic reconfiguration
    const prevSettings = prevProps.settings || {};
    const currSettings = this.props.settings || {};
    // Only compare relevant cluster settings; fallback to defaults if not present
    const prevClusterRadius = prevSettings["map.cluster_radius"] ?? 50;
    const currClusterRadius = currSettings["map.cluster_radius"] ?? 50;
    const prevMaxZoom = prevSettings["map.cluster_max_zoom"] ?? 18;
    const currMaxZoom = currSettings["map.cluster_max_zoom"] ?? 18;
    const clusterSettingsChanged =
      prevClusterRadius !== currClusterRadius || prevMaxZoom !== currMaxZoom;

    if (clusterSettingsChanged && this.pinMarkerLayer) {
      this.pinMarkerLayer.options.maxClusterRadius = currClusterRadius;
      this.pinMarkerLayer.options.disableClusteringAtZoom = currMaxZoom;
      this.pinMarkerLayer.refreshClusters();
    }

    try {
      this._createMarkers(this.props.points);
    } catch (err) {
      console.error("Error updating clustered pin map:", err);
      this.props.onRenderError &&
        this.props.onRenderError(err?.message || String(err));
    }
  }

  _createMarkers = (points) => {
    if (!this.pinMarkerLayer || !this.map) {
      return;
    }

    try {
      const mapBounds = this.map.getBounds();
      if (!mapBounds) {
        return;
      }
      const mapWest = mapBounds.getWest();
      const mapEast = mapBounds.getEast();

      // if map crosses dateline, we need wrapping
      const crossesLeftDateline = mapWest < -180 && mapEast > -180;
      const crossesRightDateline = mapWest < 180 && mapEast > 180;
      const shouldGetWrappedPoints =
        crossesLeftDateline || crossesRightDateline;

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

      // Clear existing markers
      this.pinMarkerLayer.clearLayers();

      // Create new markers
      wrappedPoints.forEach((point, i) => {
        const index = shouldGetWrappedPoints ? point[2] : i;
        const marker = this._createMarker(index);
        marker.setLatLng(point.slice(0, 2));
        this.pinMarkerLayer.addLayer(marker);
      });
    } catch (err) {
      console.error("Error creating markers:", err);
      this.props.onRenderError && this.props.onRenderError(err.message || err);
    }
  };

  _createMarker = (rowIndex) => {
    const marker = L.marker([0, 0], { icon: this.pinMarkerIcon });

    const { onHoverChange, onVisualizationClick, settings } = this.props;
    if (onHoverChange) {
      marker.on("mousemove", (e) => {
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
        onHoverChange(null);
      });
    }
    if (onVisualizationClick) {
      marker.on("click", () => {
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
    }
    return marker;
  };
}
