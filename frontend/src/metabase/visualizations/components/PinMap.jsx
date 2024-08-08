/* eslint-disable react/prop-types */
import cx from "classnames";
import d3 from "d3";
import L from "leaflet";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";
import { hasLatitudeAndLongitudeColumns } from "metabase-lib/v1/types/utils/isa";

import LeafletGridHeatMap from "./LeafletGridHeatMap";
import LeafletHeatMap from "./LeafletHeatMap";
import LeafletMarkerPinMap from "./LeafletMarkerPinMap";
import LeafletTilePinMap from "./LeafletTilePinMap";

const WORLD_BOUNDS = [
  [-90, -180],
  [90, 180],
];

const MAP_COMPONENTS_BY_TYPE = {
  markers: LeafletMarkerPinMap,
  tiles: LeafletTilePinMap,
  heat: LeafletHeatMap,
  grid: LeafletGridHeatMap,
};

export default class PinMap extends Component {
  static uiName = t`Pin Map`;
  static identifier = "pin_map";
  static iconName = "pinmap";

  static isSensible({ cols, rows }) {
    return hasLatitudeAndLongitudeColumns(cols);
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    if (!hasLatitudeAndLongitudeColumns(cols)) {
      throw new LatitudeLongitudeError();
    }
  }

  state;
  _map = null;

  constructor(props) {
    super(props);
    this.state = {
      lat: null,
      lng: null,
      zoom: null,
      filtering: false,
      ...this._getPoints(props),
    };
  }

  UNSAFE_componentWillReceiveProps(newProps) {
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
    const newSettings = {};
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

  onMapCenterChange = (lat, lng) => {
    this.setState({ lat, lng });
  };

  onMapZoomChange = zoom => {
    this.setState({ zoom });
  };

  _getPoints(props) {
    const {
      settings,
      series: [
        {
          data: { cols, rows },
        },
      ],
      onUpdateWarnings,
    } = props;
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

    const allPoints = rows.map(row => [
      row[latitudeIndex],
      row[longitudeIndex],
      metricIndex >= 0 ? row[metricIndex] : 1,
    ]);

    // only use points with numeric coordinates & metric
    const validPoints = allPoints.map(([lat, lng, metric]) => {
      if (settings["map.type"] === "pin") {
        return lat != null && lng != null;
      }

      return lat != null && lng != null && metric != null;
    });
    const points = allPoints.filter((_, i) => validPoints[i]);
    const updatedRows = rows.filter((_, i) => validPoints[i]);

    const warnings = [];
    const filteredRows = allPoints.length - points.length;
    if (filteredRows > 0) {
      warnings.push(
        t`We filtered out ${filteredRows} row(s) containing null values.`,
      );
    }
    if (onUpdateWarnings && warnings) {
      onUpdateWarnings(warnings);
    }

    const bounds = L.latLngBounds(points.length > 0 ? points : WORLD_BOUNDS);

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

    return { rows: updatedRows, points, bounds, min, max, binWidth, binHeight };
  }

  render() {
    const { className, settings, isEditing, isDashboard } = this.props;
    const { lat, lng, zoom } = this.state;
    const disableUpdateButton = lat == null && lng == null && zoom == null;

    const Map = MAP_COMPONENTS_BY_TYPE[settings["map.pin_type"]];

    const { rows, points, bounds, min, max, binHeight, binWidth } = this.state;

    const mapProps = { ...this.props };
    mapProps.series[0].data.rows = rows;

    return (
      <div
        data-element-id="pin-map"
        className={cx(
          className,
          DashboardS.PinMap,
          CS.relative,
          CS.hoverParent,
          CS.hoverVisibility,
        )}
        onMouseDownCapture={e => e.stopPropagation() /* prevent dragging */}
      >
        {Map ? (
          <Map
            {...mapProps}
            ref={map => (this._map = map)}
            className={cx(
              CS.absolute,
              CS.top,
              CS.left,
              CS.bottom,
              CS.right,
              CS.z1,
            )}
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
        <div
          className={cx(
            CS.absolute,
            CS.top,
            CS.right,
            CS.m1,
            CS.z2,
            CS.flex,
            CS.flexColumn,
            CS.hoverChild,
          )}
        >
          {isEditing || !isDashboard ? (
            <div
              className={cx(
                "PinMapUpdateButton",
                ButtonsS.Button,
                ButtonsS.ButtonSmall,
                CS.mb1,
                {
                  [DashboardS.PinMapUpdateButtonDisabled]: disableUpdateButton,
                },
              )}
              onClick={this.updateSettings}
            >
              {t`Save as default view`}
            </div>
          ) : null}
          {!isDashboard && (
            <div
              className={cx(
                "PinMapUpdateButton",
                ButtonsS.Button,
                ButtonsS.ButtonSmall,
                CS.mb1,
              )}
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
