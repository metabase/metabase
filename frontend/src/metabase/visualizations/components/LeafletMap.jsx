import React, { Component } from "react";
import ReactDOM from "react-dom";

import MetabaseSettings from "metabase/lib/settings";

import "leaflet/dist/leaflet.css";
import "./LeafletMap.css";

import L from "leaflet";
import "leaflet-draw";

import _ from "underscore";

import { updateLatLonFilter } from "metabase/qb/lib/actions";

export default class LeafletMap extends Component {
  componentDidMount() {
    try {
      const element = ReactDOM.findDOMNode(this.refs.map);

      const map = (this.map = L.map(element, {
        scrollWheelZoom: false,
        minZoom: 2,
        drawControlTooltips: false,
        zoomSnap: false,
      }));

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

      const mapTileUrl = MetabaseSettings.get("map_tile_server_url");
      const mapTileAttribution =
        mapTileUrl.indexOf("openstreetmap.org") >= 0
          ? 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
          : null;

      L.tileLayer(mapTileUrl, { attribution: mapTileAttribution }).addTo(map);

      map.on("moveend", () => {
        const { lat, lng } = map.getCenter();
        this.props.onMapCenterChange(lat, lng);
      });
      map.on("zoomend", () => {
        const zoom = map.getZoom();
        this.props.onMapZoomChange(zoom);
      });
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  componentDidUpdate(prevProps) {
    const { bounds, settings } = this.props;
    if (
      !prevProps ||
      prevProps.points !== this.props.points ||
      prevProps.width !== this.props.width ||
      prevProps.height !== this.props.height
    ) {
      this.map.invalidateSize();

      if (
        settings["map.center_latitude"] != null ||
        settings["map.center_longitude"] != null ||
        settings["map.zoom"] != null
      ) {
        this.map.setView(
          [settings["map.center_latitude"], settings["map.center_longitude"]],
          settings["map.zoom"],
        );
      } else {
        // compute ideal lat and lon zoom separately and use the lesser zoom to ensure the bounds are visible
        const latZoom = this.map.getBoundsZoom(
          L.latLngBounds([[bounds.getSouth(), 0], [bounds.getNorth(), 0]]),
        );
        const lonZoom = this.map.getBoundsZoom(
          L.latLngBounds([[0, bounds.getWest()], [0, bounds.getEast()]]),
        );
        const zoom = Math.min(latZoom, lonZoom);
        // NOTE: unclear why calling `fitBounds` twice is sometimes required to get it to work
        this.map.fitBounds(bounds);
        this.map.setZoom(zoom);
        this.map.fitBounds(bounds);
      }
    }
  }

  componentWillUnmount() {
    this.map.remove();
  }

  startFilter() {
    this._filter = new L.Draw.Rectangle(
      this.map,
      this.drawControl.options.rectangle,
    );
    this._filter.enable();
    this.props.onFiltering(true);
  }
  stopFilter() {
    this._filter && this._filter.disable();
    this.props.onFiltering(false);
  }
  onFilter = e => {
    const bounds = e.layer.getBounds();

    const {
      series: [{ card, data: { cols } }],
      settings,
      setCardAndRun,
    } = this.props;

    const latitudeColumn = _.findWhere(cols, {
      name: settings["map.latitude_column"],
    });
    const longitudeColumn = _.findWhere(cols, {
      name: settings["map.longitude_column"],
    });

    setCardAndRun(
      updateLatLonFilter(card, latitudeColumn, longitudeColumn, bounds),
    );

    this.props.onFiltering(false);
  };

  render() {
    const { className } = this.props;
    return <div className={className} ref="map" />;
  }

  _getLatLonIndexes() {
    const { settings, series: [{ data: { cols } }] } = this.props;
    return {
      latitudeIndex: _.findIndex(
        cols,
        col => col.name === settings["map.latitude_column"],
      ),
      longitudeIndex: _.findIndex(
        cols,
        col => col.name === settings["map.longitude_column"],
      ),
    };
  }

  _getLatLonColumns() {
    const { series: [{ data: { cols } }] } = this.props;
    const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();
    return {
      latitudeColumn: cols[latitudeIndex],
      longitudeColumn: cols[longitudeIndex],
    };
  }

  _getMetricColumn() {
    const { settings, series: [{ data: { cols } }] } = this.props;
    return _.findWhere(cols, { name: settings["map.metric_column"] });
  }
}
