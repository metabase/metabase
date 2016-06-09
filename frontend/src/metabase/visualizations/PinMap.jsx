/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { getSettingsForVisualization, setLatitudeAndLongitude, setCategory } from "metabase/lib/visualization_settings";
import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import _ from "underscore";
import cx from "classnames";
import L from "leaflet";

export default class PinMap extends Component {
    static displayName = "Pin Map";
    static identifier = "pin_map";
    static iconName = "pinmap";

    static isSensible(cols, rows) {
        return hasLatitudeAndLongitudeColumns(cols);
    }

    static checkRenderable(cols, rows) {
        if (!hasLatitudeAndLongitudeColumns(cols)) { throw new LatitudeLongitudeError(); }
    }

    constructor(props, context) {
        super(props, context);
        this.state = {
            lat: null,
            lon: null,
            zoom: null
        };
        _.bindAll(this, "onMapZoomChange", "onMapCenterChange", "updateSettings");
    }

    updateSettings() {
        if (this.state.lat != null) {
            this.props.onUpdateVisualizationSetting(["map", "center_latitude"], this.state.lat);
        }
        if (this.state.lon != null) {
            this.props.onUpdateVisualizationSetting(["map", "center_longitude"], this.state.lon);
        }
        if (this.state.zoom != null) {
            this.props.onUpdateVisualizationSetting(["map", "zoom"], this.state.zoom);
        }
        this.setState({ lat: null, lon: null, zoom: null });
    }

    onMapCenterChange(lat, lon) {
        this.setState({ lat, lon });
    }

    onMapZoomChange(zoom) {
        this.setState({ zoom });
    }

    averageCoordinate(coordinates) {
        return _.reduce(coordinates, (memo, num) => {return memo + num}, 0) / coordinates.length;
    }

    genMarker(color){
        return L.VectorMarkers.icon({
            markerColor: color
        });
    }

    componentDidMount() {
        try {
            let element = ReactDOM.findDOMNode(this.refs.map);

            let { card, data } = this.props.series[0];

            let settings = card.visualization_settings;
            settings = getSettingsForVisualization(settings, "pin_map");
            settings = setLatitudeAndLongitude(settings, data.cols);
            settings = setCategory(settings, data.cols);
            console.log(settings);

            let latColIndex = settings.map.latitude_dataset_col_index;
            let lonColIndex = settings.map.longitude_dataset_col_index;

            let center_latitude = settings.map.center_latitude;
            let center_longitude = settings.map.center_longitude;
            if (!center_latitude || !center_longitude){
              center_latitude = this.averageCoordinate(_.pluck(data.rows, latColIndex));
              center_longitude = this.averageCoordinate(_.pluck(data.rows, lonColIndex));
            }

            L.Icon.Default.imagePath = '/app/img';
            let map = L.map(element).setView([center_latitude, center_longitude], settings.map.zoom);

            L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
              attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
              maxZoom: 18,
            }).addTo(map);
            for (let row of data.rows) {
              let options = {
                icon: this.genMarker('red')
              }
              let marker = L.marker([row[latColIndex], row[lonColIndex]], options).addTo(map);

              let tooltipElement = document.createElement("div");
              ReactDOM.render(<ObjectDetailTooltip row={row} cols={data.cols} />, tooltipElement);
              marker.bindPopup(tooltipElement);
            }

            map.on('moveend', () => {
              let center = map.getCenter();
              this.onMapCenterChange(center.lat, center.lng);
            });

            map.on('zoomend', () => {
              this.onMapZoomChange(map.getZoom());
            })

        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        const { className, isEditing } = this.props;
        const { lat, lon, zoom } = this.state;
        const disableUpdateButton = lat == null && lon == null && zoom == null;
        return (
            <div className={className + " PinMap relative"} onMouseDownCapture={(e) =>e.stopPropagation() /* prevent dragging */}>
                <div className="absolute top left bottom right" ref="map"></div>
                { isEditing ?
                    <div className={cx("PinMapUpdateButton Button Button--small absolute top right m1", { "PinMapUpdateButton--disabled": disableUpdateButton })} onClick={this.updateSettings}>
                        Save as default view
                    </div>
                : null }
            </div>
        );
    }
}

const ObjectDetailTooltip = ({ row, cols }) =>
    <table>
        <tbody>
            { cols.map((col, index) =>
                <tr>
                    <td>{col.display_name}</td>
                    <td>{row[index]}</td>
                </tr>
            )}
        </tbody>
    </table>
