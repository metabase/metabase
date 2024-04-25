/* eslint-disable import/order, react/prop-types */
import { Component, createRef } from "react";
import _ from "underscore";

import "leaflet/dist/leaflet.css";
import "./LeafletMap.module.css";

import L from "leaflet";
import "leaflet-draw";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import MetabaseSettings from "metabase/lib/settings";

export default class LeafletMap extends Component {
  constructor(props) {
    super(props);

    this.mapRef = createRef();
  }

  componentDidMount() {
    try {
      const element = this.mapRef.current;

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

      const mapTileUrl = MetabaseSettings.get("map-tile-server-url");
      let mapTileHostname = "";
      try {
        mapTileHostname = new URL(mapTileUrl).host;
      } catch (e) {}
      const mapTileAttribution = mapTileHostname.includes("openstreetmap.org")
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
    const { isNative } = Lib.queryDisplayInfo(question.query());

    if (!isNative) {
      const query = question.query();
      const stageIndex = -1;
      const filterBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      };
      const updatedQuery = Lib.updateLatLonFilter(
        query,
        stageIndex,
        latitudeColumn,
        longitudeColumn,
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
        col => col.name === settings["map.latitude_column"],
      ),
      longitudeIndex: _.findIndex(
        cols,
        col => col.name === settings["map.longitude_column"],
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
    return _.findWhere(cols, { name: settings["map.metric_column"] });
  }
}
