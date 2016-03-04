/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { getSettingsForVisualization, setLatitudeAndLongitude } from "metabase/lib/visualization_settings";
import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import _ from "underscore";

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
        this.state = {};
        _.bindAll(this, "updateMapZoom", "updateMapCenter");
    }

    updateMapCenter(lat, lon) {
        this.props.onUpdateVisualizationSetting(["map", "center_latitude"], lat);
        this.props.onUpdateVisualizationSetting(["map", "center_longitude"], lat);
    }

    updateMapZoom(zoom) {
        this.props.onUpdateVisualizationSetting(["map", "zoom"], zoom);
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
            let element = ReactDOM.findDOMNode(this);

            let { card, data } = this.props.series[0];

            let settings = card.visualization_settings;

            settings = getSettingsForVisualization(settings, "pin_map");
            settings = setLatitudeAndLongitude(settings, data.cols);

            let mapOptions = {
                zoom: settings.map.zoom,
                center: new google.maps.LatLng(settings.map.center_latitude, settings.map.center_longitude),
                mapTypeId: google.maps.MapTypeId.MAP,
                scrollwheel: false
            };

            let map = this.map = new google.maps.Map(element, mapOptions);

            if (data.rows.length < 2000) {
                let tooltip = new google.maps.InfoWindow();
                let latColIndex = settings.map.latitude_dataset_col_index;
                let lonColIndex = settings.map.longitude_dataset_col_index;
                for (let row of data.rows) {
                    let marker = new google.maps.Marker({
                        position: new google.maps.LatLng(row[latColIndex], row[lonColIndex]),
                        map: map,
                        icon: "/app/img/pin.png"
                    });
                    marker.addListener("click", () => {
                        let tooltipElement = document.createElement("div");
                        ReactDOM.render(<ObjectDetailTooltip row={row} cols={data.cols} />, tooltipElement);
                        tooltip.setContent(tooltipElement);
                        tooltip.open(map, marker);
                    });
                }
            } else {
                map.overlayMapTypes.push(new google.maps.ImageMapType({
                    getTileUrl: this.getTileUrl.bind(this, settings),
                    tileSize: new google.maps.Size(256, 256)
                }));
            }

            map.addListener("center_changed", () => {
                let center = map.getCenter();
                this.updateMapCenter(center.lat(), center.lng());
            });

            map.addListener("zoom_changed", () => {
                this.updateMapZoom(map.getZoom());
            });
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
        return <div {...this.props}>x</div>;
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
