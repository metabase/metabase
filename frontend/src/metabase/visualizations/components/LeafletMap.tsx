import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "./LeafletMap.module.css";

import L from "leaflet";
import { Component, createRef } from "react";
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import { isNullOrUndefined } from "metabase/lib/types";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

type LegacyColumn = {
  name?: string;
  field_ref?: unknown;
  [key: string]: unknown;
};

type LeafletMapSeriesEntry = {
  card: Record<string, unknown>;
  data: {
    cols: LegacyColumn[];
  };
};

type MapSettings = {
  "map.latitude_column"?: string;
  "map.longitude_column"?: string;
  "map.metric_column"?: string;
  "map.center_latitude"?: number;
  "map.center_longitude"?: number;
  "map.zoom"?: number;
  [key: string]: unknown;
};

export interface LeafletMapProps {
  className?: string;
  width?: number;
  height?: number;
  bounds: L.LatLngBounds;
  settings: MapSettings;
  points?: unknown[] | null;
  series: LeafletMapSeriesEntry[];
  metadata?: Metadata;
  token?: string | null;
  zoomControl?: boolean;
  zoom?: number | null;
  lat?: number | null;
  lng?: number | null;
  onMapCenterChange: (lat: number, lng: number) => void;
  onMapZoomChange: (zoom: number) => void;
  onRenderError: (error?: unknown) => void;
  onFiltering: (filtering: boolean) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
}

export class LeafletMap extends Component<LeafletMapProps> {
  mapRef = createRef<HTMLDivElement>();
  map: L.Map | null = null;
  drawControl: L.DrawOptions | null = null;
  _filter?: L.Draw.Rectangle;

  componentDidMount() {
    try {
      const element = this.mapRef.current;
      if (!element) {
        return;
      }

      const mapOptions = {
        scrollWheelZoom: true,
        wheelPxPerZoomLevel: 30,
        minZoom: 2,

        zoomSnap: 0,
        // Set max bounds for latitude only, allowing longitude to wrap
        maxBounds: [
          [-90, -Infinity], // Southwest corner (limit south, no limit west)
          [90, Infinity], // Northeast corner (limit north, no limit east)
        ],
        maxBoundsViscosity: 1.0, // Completely prevent panning outside latitude bounds
        worldCopyJump: true, // Enable smooth horizontal wrapping
      } satisfies L.MapOptions;
      const map = (this.map = L.map(element, mapOptions));

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      const drawControl = (this.drawControl = new L.Control.Draw({
        draw: {
          rectangle: false,
          polyline: false,
          polygon: false,
          circle: false,
          marker: false,
        },
        edit: {
          featureGroup: drawnItems,
          edit: false,
          remove: false,
        },
      }));
      map.addControl(drawControl);
      map.on("draw:created", this.onFilter);

      map.setView([0, 0], 8);

      const mapTileUrl = MetabaseSettings.get("map-tile-server-url") ?? "";
      let mapTileHostname = "";
      try {
        mapTileHostname = new URL(mapTileUrl).host;
      } catch {}
      const mapTileAttribution = mapTileHostname.includes("openstreetmap.org")
        ? 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
        : undefined;

      L.tileLayer(mapTileUrl, { attribution: mapTileAttribution }).addTo(map);

      map.on("moveend", () => {
        const { lat, lng } = map.getCenter();
        this.props.onMapCenterChange(lat, lng);
      });
      map.on("zoomend", () => {
        const zoom = map.getZoom();
        this.props.onMapZoomChange(zoom);
      });
    } catch (error) {
      console.error(error);
      this.props.onRenderError(
        error instanceof Error ? error.message : (error ?? undefined),
      );
    }
  }

  componentDidUpdate(prevProps: LeafletMapProps) {
    if (!this.map) {
      return;
    }

    const { bounds, settings, zoomControl, zoom, lat, lng } = this.props;

    if (prevProps.zoomControl !== zoomControl) {
      if (zoomControl === false) {
        this.map.zoomControl?.remove();
      } else if (this.map.zoomControl) {
        this.map.zoomControl.addTo(this.map);
      }
    }

    const isInitialUpdate = !prevProps;
    const pointsChanged = prevProps && prevProps.points !== this.props.points;
    const dimensionsChanged =
      prevProps &&
      (prevProps.width !== this.props.width ||
        prevProps.height !== this.props.height);

    if (!isInitialUpdate && !pointsChanged && !dimensionsChanged) {
      return;
    }

    this.map.invalidateSize();

    const [centerLatitude, centerLongitude] = [
      settings["map.center_latitude"],
      settings["map.center_longitude"],
    ];

    // Pure resize (no data change): preserve user's current view
    if (!isInitialUpdate && !pointsChanged && dimensionsChanged) {
      if (zoom != null) {
        const currentCenter = this.map.getCenter();
        this.map.setView(
          [lat ?? currentCenter.lat, lng ?? currentCenter.lng],
          zoom,
        );
      }
      // Don't reset to saved settings or recalculate on pure resize
      return;
    }

    // Initial update or data changed: apply saved settings if available
    if (
      !isNullOrUndefined(centerLatitude) &&
      !isNullOrUndefined(centerLongitude)
    ) {
      this.map.setView([centerLatitude, centerLongitude], settings["map.zoom"]);
      return;
    }

    // No saved view: fit to data bounds
    if (shouldRecalculateZoom(prevProps?.points, this.props.points)) {
      // compute ideal lat and lon zoom separately and use the lesser zoom to ensure the bounds are visible
      const latZoom = this.map.getBoundsZoom(
        L.latLngBounds([
          [bounds.getSouth(), 0],
          [bounds.getNorth(), 0],
        ]),
      );
      const lonZoom = this.map.getBoundsZoom(
        L.latLngBounds([
          [0, bounds.getWest()],
          [0, bounds.getEast()],
        ]),
      );
      const mapZoom = Math.min(latZoom, lonZoom);
      // NOTE: unclear why calling `fitBounds` twice is sometimes required to get it to work
      this.map.fitBounds(bounds);
      this.map.setZoom(mapZoom);
      this.map.fitBounds(bounds);
    }
  }

  componentWillUnmount() {
    if (!this.map) {
      return;
    }
    this.map.remove();
  }

  supportsFilter() {
    const {
      series: [{ card }],
      metadata,
      token,
    } = this.props;

    const isStaticEmbedding = !!token;

    if (isStaticEmbedding) {
      return false;
    }

    const question = new Question(card, metadata);
    const { isNative } = Lib.queryDisplayInfo(question.query());
    return !isNative || question.isSaved();
  }

  startFilter() {
    if (!this.map || !this.drawControl) {
      return;
    }
    this._filter = new L.Draw.Rectangle(
      this.map,
      this.drawControl.options.rectangle,
    );
    this._filter.enable();
    this.props.onFiltering(true);
  }

  stopFilter() {
    this._filter?.disable();
    this.props.onFiltering(false);
  }

  onFilter = (event: L.DrawEvents.Created) => {
    if (!(event.layer instanceof L.Rectangle)) {
      return;
    }
    const bounds = event.layer.getBounds();

    const {
      series: [
        {
          card,
          data: { cols },
        },
      ],
      settings,
      onChangeCardAndRun,
      metadata,
    } = this.props;

    const latitudeColumn = _.findWhere(cols, {
      name: settings["map.latitude_column"],
    });
    const longitudeColumn = _.findWhere(cols, {
      name: settings["map.longitude_column"],
    });

    const question = new Question(card, metadata);
    if (this.supportsFilter()) {
      const query = question.query();
      const stageIndex = -1;

      // Longitudes should be wrapped to the canonical range [-180, 180]. If the delta is >= 360,
      // select the full range; otherwise, you wind up selecting only the overlapping portion.
      const lngDelta = Math.abs(bounds.getEast() - bounds.getWest());
      const west = lngDelta >= 360 ? -180 : bounds.getSouthWest().wrap().lng;
      const east = lngDelta >= 360 ? 180 : bounds.getNorthEast().wrap().lng;

      const filterBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        west,
        east,
      };
      const updatedQuery = Lib.updateLatLonFilter(
        query,
        stageIndex,
        Lib.fromLegacyColumn(query, stageIndex, latitudeColumn as any),
        Lib.fromLegacyColumn(query, stageIndex, longitudeColumn as any),
        question.id(),
        filterBounds,
      );
      const updatedQuestion = question.setQuery(updatedQuery);
      const nextCard = updatedQuestion.card();

      onChangeCardAndRun({ nextCard });
    }

    this.props.onFiltering(false);
  };

  render() {
    const { className } = this.props;
    return <div className={className} ref={this.mapRef} />;
  }

  _getLatLonIndexes() {
    const {
      settings,
      series: [
        {
          data: { cols },
        },
      ],
    } = this.props;
    return {
      latitudeIndex: _.findIndex(
        cols,
        (col: LegacyColumn) => col.name === settings["map.latitude_column"],
      ),
      longitudeIndex: _.findIndex(
        cols,
        (col: LegacyColumn) => col.name === settings["map.longitude_column"],
      ),
    };
  }

  _getLatLonColumns() {
    const {
      series: [
        {
          data: { cols },
        },
      ],
    } = this.props;
    const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();
    return {
      latitudeColumn: cols[latitudeIndex],
      longitudeColumn: cols[longitudeIndex],
    };
  }

  _getMetricColumn() {
    const {
      settings,
      series: [
        {
          data: { cols },
        },
      ],
    } = this.props;
    return _.findWhere(cols, {
      name: settings["map.metric_column"],
    });
  }
}

/**
 * Lightweight function to check if points have changed (e.g. due to filters)
 * so that we should recalculate the zoom.
 */
function shouldRecalculateZoom(
  prevPoints?: unknown[] | null,
  nextPoints?: unknown[] | null,
) {
  if (!prevPoints && !nextPoints) {
    return false;
  }

  return !prevPoints || nextPoints !== prevPoints;
}
