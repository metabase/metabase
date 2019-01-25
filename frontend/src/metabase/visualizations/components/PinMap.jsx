/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import LeafletMarkerPinMap from "./LeafletMarkerPinMap";
import LeafletTilePinMap from "./LeafletTilePinMap";
import LeafletHeatMap from "./LeafletHeatMap";
import LeafletGridHeatMap from "./LeafletGridHeatMap";

import _ from "underscore";
import cx from "classnames";
import d3 from "d3";

import L from "leaflet";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type Props = VisualizationProps;

type State = {
  lat: ?number,
  lng: ?number,
  min: ?number,
  max: ?number,
  binHeight: ?number,
  binWidth: ?number,
  zoom: ?number,
  points: L.Point[],
  bounds: L.Bounds,
  filtering: boolean,
};

const MAP_COMPONENTS_BY_TYPE = {
  markers: LeafletMarkerPinMap,
  tiles: LeafletTilePinMap,
  heat: LeafletHeatMap,
  grid: LeafletGridHeatMap,
};

export default class PinMap extends Component {
  props: Props;
  state: State;

  static uiName = t`Pin Map`;
  static identifier = "pin_map";
  static iconName = "pinmap";

  static isSensible({ cols, rows }) {
    return hasLatitudeAndLongitudeColumns(cols);
  }

  static checkRenderable([{ data: { cols, rows } }]) {
    if (!hasLatitudeAndLongitudeColumns(cols)) {
      throw new LatitudeLongitudeError();
    }
  }

  state: State;
  _map: ?(LeafletMarkerPinMap | LeafletTilePinMap) = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      lat: null,
      lng: null,
      zoom: null,
      filtering: false,
      ...this._getPoints(props),
    };
  }

  componentWillReceiveProps(newProps: Props) {
    const SETTINGS_KEYS = [
      "map.latitude_column",
      "map.longitude_column",
      "map.metric_column",
    ];
    if (
      newProps.series[0].data !== this.props.series[0].data ||
      !_.isEqual(
        _.pick(newProps.settings, ...SETTINGS_KEYS),
        _.pick(this.props.settings, ...SETTINGS_KEYS),
      )
    ) {
      this.setState(this._getPoints(newProps));
    }
  }

  updateSettings = () => {
    let newSettings = {};
    if (this.state.lat != null) {
      newSettings["map.center_latitude"] = this.state.lat;
    }
    if (this.state.lng != null) {
      newSettings["map.center_longitude"] = this.state.lng;
    }
    if (this.state.zoom != null) {
      newSettings["map.zoom"] = this.state.zoom;
    }
    this.props.onUpdateVisualizationSettings(newSettings);
    this.setState({ lat: null, lng: null, zoom: null });
  };

  onMapCenterChange = (lat: number, lng: number) => {
    this.setState({ lat, lng });
  };

  onMapZoomChange = (zoom: number) => {
    this.setState({ zoom });
  };

  _getPoints(props: Props) {
    const { settings, series: [{ data: { cols, rows } }] } = props;
    const latitudeIndex = _.findIndex(
      cols,
      col => col.name === settings["map.latitude_column"],
    );
    const longitudeIndex = _.findIndex(
      cols,
      col => col.name === settings["map.longitude_column"],
    );
    const metricIndex = _.findIndex(
      cols,
      col => col.name === settings["map.metric_column"],
    );

    const points = rows.map(row => [
      row[latitudeIndex],
      row[longitudeIndex],
      metricIndex >= 0 ? row[metricIndex] : 1,
    ]);

    const bounds = L.latLngBounds(points);

    const min = d3.min(points, point => point[2]);
    const max = d3.max(points, point => point[2]);

    const binWidth =
      cols[longitudeIndex] &&
      cols[longitudeIndex].binning_info &&
      cols[longitudeIndex].binning_info.bin_width;
    const binHeight =
      cols[latitudeIndex] &&
      cols[latitudeIndex].binning_info &&
      cols[latitudeIndex].binning_info.bin_width;

    if (binWidth != null) {
      bounds._northEast.lng += binWidth;
    }
    if (binHeight != null) {
      bounds._northEast.lat += binHeight;
    }

    return { points, bounds, min, max, binWidth, binHeight };
  }

  render() {
    const { className, settings, isEditing, isDashboard } = this.props;
    let { lat, lng, zoom } = this.state;
    const disableUpdateButton = lat == null && lng == null && zoom == null;

    const Map = MAP_COMPONENTS_BY_TYPE[settings["map.pin_type"]];

    const { points, bounds, min, max, binHeight, binWidth } = this.state;

    return (
      <div
        className={cx(
          className,
          "PinMap relative hover-parent hover--visibility",
        )}
        onMouseDownCapture={e => e.stopPropagation() /* prevent dragging */}
      >
        {Map ? (
          <Map
            {...this.props}
            ref={map => (this._map = map)}
            className="absolute top left bottom right z1"
            onMapCenterChange={this.onMapCenterChange}
            onMapZoomChange={this.onMapZoomChange}
            lat={lat}
            lng={lng}
            zoom={zoom}
            points={points}
            bounds={bounds}
            min={min}
            max={max}
            binWidth={binWidth}
            binHeight={binHeight}
            onFiltering={filtering => this.setState({ filtering })}
          />
        ) : null}
        <div className="absolute top right m1 z2 flex flex-column hover-child">
          {isEditing || !isDashboard ? (
            <div
              className={cx("PinMapUpdateButton Button Button--small mb1", {
                "PinMapUpdateButton--disabled": disableUpdateButton,
              })}
              onClick={this.updateSettings}
            >
              {t`Save as default view`}
            </div>
          ) : null}
          {!isDashboard && (
            <div
              className={cx("PinMapUpdateButton Button Button--small mb1")}
              onClick={() => {
                if (
                  !this.state.filtering &&
                  this._map &&
                  this._map.startFilter
                ) {
                  this._map.startFilter();
                } else if (
                  this.state.filtering &&
                  this._map &&
                  this._map.stopFilter
                ) {
                  this._map.stopFilter();
                }
              }}
            >
              {!this.state.filtering ? t`Draw box to filter` : t`Cancel filter`}
            </div>
          )}
        </div>
      </div>
    );
  }
}
