/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";
import { formatValue } from "metabase/lib/formatting";

import "leaflet/dist/leaflet.css";
import L from "leaflet/dist/leaflet-src.js";

import _ from "underscore";
import cx from "classnames";

const MARKER_ICON = L.icon({
    iconUrl: "/app/img/pin.png",
    iconSize: [28, 32],
    iconAnchor: [15, 24],
    popupAnchor: [0, -13]
});

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
        let newSettings = {};
        if (this.state.lat != null) {
            newSettings["map.center_latitude"] = this.state.lat;
        }
        if (this.state.lon != null) {
            newSettings["map.center_longitude"] = this.state.lon;
        }
        if (this.state.zoom != null) {
            newSettings["map.zoom"] = this.state.zoom;
        }
        this.props.onUpdateVisualizationSettings(newSettings);
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

            const map = this.map = L.map(element, {
                scrollWheelZoom: false,
            })

            map.setView([
                settings["map.center_latitude"],
                settings["map.center_longitude"]
            ], settings["map.zoom"]);

            L.tileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
            }).addTo(map);

            this.pinMarkerLayer = L.layerGroup([]);
            this.pinTileLayer = L.tileLayer("", {});
            this.popup = L.popup();

            map.on("moveend", () => {
                const { lat, lng } = map.getCenter();
                this.onMapCenterChange(lat, lng);
            });
            map.on("zoomend", () => {
                const zoom = map.getZoom();
                this.onMapZoomChange(zoom);
            });
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    _createMarker = (index) => {
        const marker = L.marker([0,0], { icon: MARKER_ICON });
        marker.on("click", () => {
            const { series: [{ data }] } = this.props;
            const { popup } = this;
            const el = document.createElement("div");
            ReactDOM.render(<ObjectDetailTooltip row={data.rows[index]} cols={data.cols} />, el);
            marker.unbindPopup();
            marker.bindPopup(el, popup);
            marker.openPopup();
        });
        return marker;
    }

    componentDidUpdate() {
        try {
            const { map, pinTileLayer, pinMarkerLayer } = this;
            const { settings, series: [{ data: { rows } }] } = this.props;
            const type = settings["map.pin_type"];

            if (type === "markers") {
                const { latitudeIndex, longitudeIndex } = this.getLatLongIndexes();
                let markers = pinMarkerLayer.getLayers();
                let max = Math.max(rows.length, markers.length);
                for (let i = 0; i < max; i++) {
                    if (i >= rows.length) {
                        pinMarkerLayer.removeLayer(markers[i]);
                    }
                    if (i >= markers.length) {
                        const marker = this._createMarker(i);
                        pinMarkerLayer.addLayer(marker);
                        markers.push(marker);
                    }

                    if (i < rows.length) {
                        const { lat, lng } = markers[i].getLatLng();
                        if (lat !== rows[i][latitudeIndex] || lng !== rows[i][longitudeIndex]) {
                            markers[i].setLatLng([rows[i][latitudeIndex], rows[i][longitudeIndex]]);
                        }
                    }
                }

                if (!map.hasLayer(pinMarkerLayer)) {
                    map.removeLayer(pinTileLayer);
                    map.addLayer(pinMarkerLayer);
                }
            } else if (type === "tiles") {
                const newUrl = this.getTileUrl({ x: "{x}", y: "{y}"}, "{z}");
                if (newUrl !== pinTileLayer._url) {
                    pinTileLayer.setUrl(newUrl)
                }

                if (!map.hasLayer(pinTileLayer)) {
                    map.removeLayer(pinMarkerLayer);
                    map.addLayer(pinTileLayer);
                }
            }
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        const { className, isEditing, isDashboard } = this.props;
        const { lat, lon, zoom } = this.state;
        const disableUpdateButton = lat == null && lon == null && zoom == null;
        return (
            <div className={className + " PinMap relative"} onMouseDownCapture={(e) =>e.stopPropagation() /* prevent dragging */}>
                <div className="absolute top left bottom right z1" ref="map"></div>
                { isEditing || !isDashboard ?
                    <div className={cx("PinMapUpdateButton Button Button--small absolute top right m1 z2", { "PinMapUpdateButton--disabled": disableUpdateButton })} onClick={this.updateSettings}>
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
                    <td className="pr1">{col.display_name}:</td>
                    <td>{formatValue(row[index], { column: col, jsx: true })}</td>
                </tr>
            )}
        </tbody>
    </table>
