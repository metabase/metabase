/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { getSettingsForVisualization, setLatitudeAndLongitude } from "metabase/lib/visualization_settings";
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

    getTileUrl(settings, coord, zoom) {
        let query = this.props.series[0].card.dataset_query;

        let latitude_dataset_col_index = settings.map.latitude_dataset_col_index;
        let longitude_dataset_col_index = settings.map.longitude_dataset_col_index;
        let latitude_source_table_field_id = settings.map.latitude_source_table_field_id;
        let longitude_source_table_field_id = settings.map.longitude_source_table_field_id;

        if (latitude_dataset_col_index == null || longitude_dataset_col_index == null) {
            return;
        }

        if (latitude_source_table_field_id == null || longitude_source_table_field_id == null) {
            throw ("Map ERROR: latitude and longitude column indices must be specified");
        }
        if (latitude_dataset_col_index == null || longitude_dataset_col_index == null) {
            throw ("Map ERROR: unable to find specified latitude / longitude columns in source table");
        }

        return '/api/tiles/' + zoom + '/' + coord.x + '/' + coord.y + '/' +
            latitude_source_table_field_id + '/' + longitude_source_table_field_id + '/' +
            latitude_dataset_col_index + '/' + longitude_dataset_col_index + '/' +
            '?query=' + encodeURIComponent(JSON.stringify(query))
    }

    componentDidMount() {
        if (typeof google === undefined) {
            setTimeout(() => this.componentDidMount(), 500);
            return;
        }

        try {
            let element = ReactDOM.findDOMNode(this.refs.map);

            let { card, data } = this.props.series[0];

            let settings = card.visualization_settings;

            settings = getSettingsForVisualization(settings, "pin_map");
            settings = setLatitudeAndLongitude(settings, data.cols);

          /* let mapOptions = {
           *     zoom: settings.map.zoom,
           *     center: new google.maps.LatLng(settings.map.center_latitude, settings.map.center_longitude),
           *     mapTypeId: google.maps.MapTypeId.MAP,
           *     scrollwheel: false
           * };

           * let map = this.map = new google.maps.Map(element, mapOptions);*/

          /* if (data.rows.length < 2000) {
           *     let tooltip = new google.maps.InfoWindow();
           *     let latColIndex = settings.map.latitude_dataset_col_index;
           *     let lonColIndex = settings.map.longitude_dataset_col_index;
           *     for (let row of data.rows) {
           *         let marker = new google.maps.Marker({
           *             position: new google.maps.LatLng(row[latColIndex], row[lonColIndex]),
           *             map: map,
           *             icon: "/app/img/pin.png"
           *         });
           *         marker.addListener("click", () => {
           *             let tooltipElement = document.createElement("div");
           *             ReactDOM.render(<ObjectDetailTooltip row={row} cols={data.cols} />, tooltipElement);
           *             tooltip.setContent(tooltipElement);
           *             tooltip.open(map, marker);
           *         });
           *     }
           * } else {
           *     map.overlayMapTypes.push(new google.maps.ImageMapType({
           *         getTileUrl: this.getTileUrl.bind(this, settings),
           *         tileSize: new google.maps.Size(256, 256)
           *     }));
           * }*/
            L.Icon.Default.imagePath = '/app/img';
            let map = L.map(element).setView([settings.map.center_latitude, settings.map.center_longitude], settings.map.zoom);

            L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
              attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
              maxZoom: 18,
            }).addTo(map);
            for (let row of data.rows) {
              let latColIndex = settings.map.latitude_dataset_col_index;
              let lonColIndex = settings.map.longitude_dataset_col_index;

              let marker = L.marker([row[latColIndex], row[lonColIndex]]).addTo(map);

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

          /* map.addListener("center_changed", () => {
           *     let center = map.getCenter();
           *     this.onMapCenterChange(center.lat(), center.lng());
           * });

           * map.addListener("zoom_changed", () => {
           *     this.onMapZoomChange(map.getZoom());
           * });*/
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    componentDidUpdate() {
        if (typeof google !== "undefined") {
            google.maps.event.trigger(this.map, "resize");
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
