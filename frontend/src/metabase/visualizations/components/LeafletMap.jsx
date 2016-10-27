import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import "leaflet/dist/leaflet.css";
import L from "leaflet/dist/leaflet-src.js";

import _ from "underscore";

export default class LeafletMap extends Component {
    componentDidMount() {
        try {
            const element = ReactDOM.findDOMNode(this.refs.map);
            const { settings } = this.props;

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

    render() {
        const { className } = this.props;
        return (
            <div className={className} ref="map"></div>
        );
    }

    _getLatLongIndexes() {
        const { settings, series: [{ data: { cols }}] } = this.props;
        return {
            latitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.latitude_column"]),
            longitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.longitude_column"])
        };
    }
}
