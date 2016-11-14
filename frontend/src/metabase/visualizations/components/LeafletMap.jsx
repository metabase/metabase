import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import MetabaseSettings from "metabase/lib/settings";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import _ from "underscore";

export default class LeafletMap extends Component {
    componentDidMount() {
        try {
            const element = ReactDOM.findDOMNode(this.refs.map);

            const map = this.map = L.map(element, {
                scrollWheelZoom: false,
                minZoom: 2
            })

            map.setView([0,0], 8);

            const mapTileUrl = MetabaseSettings.get("map_tile_server_url");
            const mapTileAttribution = mapTileUrl.indexOf("openstreetmap.org") >= 0 ? 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors' : null;

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
        if (!prevProps || prevProps.points !== this.props.points) {
            if (settings["map.center_latitude"] != null || settings["map.center_longitude"] != null || settings["map.zoom"] != null) {
                this.map.setView([
                    settings["map.center_latitude"],
                    settings["map.center_longitude"]
                ], settings["map.zoom"]);
            } else {
                this.map.fitBounds(bounds);
            }
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
