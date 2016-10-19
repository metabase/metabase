/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import _ from "underscore";
import cx from "classnames";

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
            this.props.onUpdateVisualizationSetting("map.center_latitude", this.state.lat);
        }
        if (this.state.lon != null) {
            this.props.onUpdateVisualizationSetting("map.center_longitude", this.state.lon);
        }
        if (this.state.zoom != null) {
            this.props.onUpdateVisualizationSetting("map.zoom", this.state.zoom);
        }
        this.setState({ lat: null, lon: null, zoom: null });
    }

    onMapCenterChange(lat, lon) {
        this.setState({ lat, lon });
    }

    onMapZoomChange(zoom) {
        this.setState({ zoom });
    }

    getLatLongIndexes() {
        const { settings, series: [{ data: { cols }}] } = this.props;
        return {
            latitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.latitude_column"]),
            longitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.longitude_column"])
        };
    }

    getTileUrl = (coord, zoom) => {
        const [{ card: { dataset_query }, data: { cols }}] = this.props.series;

        const { latitudeIndex, longitudeIndex } = this.getLatLongIndexes();
        const latitudeField = cols[latitudeIndex];
        const longitudeField = cols[longitudeIndex];

        if (!latitudeField || !longitudeField) {
            return;
        }

        return '/api/tiles/' + zoom + '/' + coord.x + '/' + coord.y + '/' +
            latitudeField.id + '/' + longitudeField.id + '/' +
            latitudeIndex + '/' + longitudeIndex + '/' +
            '?query=' + encodeURIComponent(JSON.stringify(dataset_query))
    }

    componentDidMount() {
        if (typeof google === undefined) {
            setTimeout(() => this.componentDidMount(), 500);
            return;
        }

        try {
            const element = ReactDOM.findDOMNode(this.refs.map);
            const { settings, series: [{ data }] } = this.props;

            const mapOptions = {
                zoom: settings["map.zoom"],
                center: new google.maps.LatLng(
                    settings["map.center_latitude"],
                    settings["map.center_longitude"]
                ),
                mapTypeId: google.maps.MapTypeId.MAP,
                scrollwheel: false
            };

            const map = this.map = new google.maps.Map(element, mapOptions);

            if (data.rows.length < 2000) {
                let tooltip = new google.maps.InfoWindow();
                let { latitudeIndex, longitudeIndex } = this.getLatLongIndexes();
                for (let row of data.rows) {
                    let marker = new google.maps.Marker({
                        position: new google.maps.LatLng(row[latitudeIndex], row[longitudeIndex]),
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
                    getTileUrl: this.getTileUrl,
                    tileSize: new google.maps.Size(256, 256)
                }));
            }

            map.addListener("center_changed", () => {
                let center = map.getCenter();
                this.onMapCenterChange(center.lat(), center.lng());
            });

            map.addListener("zoom_changed", () => {
                this.onMapZoomChange(map.getZoom());
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
