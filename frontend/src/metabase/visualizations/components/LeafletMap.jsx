import React, { Component } from "react";
import ReactDOM from "react-dom";

import MetabaseSettings from "metabase/lib/settings";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet-draw";

import _ from "underscore";

import { updateIn } from "icepick";
import * as Query from "metabase/lib/query/query";
import { mbqlEq } from "metabase/lib/query/util";

export default class LeafletMap extends Component {
    componentDidMount() {
        try {
            const element = ReactDOM.findDOMNode(this.refs.map);

            const map = this.map = L.map(element, {
                scrollWheelZoom: false,
                minZoom: 2,
                drawControlTooltips: false
            });

            const drawnItems = new L.FeatureGroup();
            map.addLayer(drawnItems);
            const drawControl = this.drawControl = new L.Control.Draw({
                draw: {
                    rectangle: false,
                    polyline: false,
                    polygon: false,
                    circle: false,
                    marker: false
                },
                edit: {
                    featureGroup: drawnItems,
                    edit: false,
                    remove: false
                }
            });
            map.addControl(drawControl);
            map.on("draw:created", this.onFilter);

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
                this.map.setZoom(this.map.getBoundsZoom(bounds, true));
            }
        }
    }

    startFilter() {
        this._filter = new L.Draw.Rectangle(this.map, this.drawControl.options.rectangle);
        this._filter.enable();
        this.props.onFiltering(true);
    }
    stopFilter() {
        this._filter && this._filter.disable();
        this.props.onFiltering(false);
    }
    onFilter = (e) => {
        const bounds = e.layer.getBounds();

        const { series: [{ card, data: { cols } }], settings, setCardAndRun } = this.props;

        const latitudeColumn = _.findWhere(cols, { name: settings["map.latitude_column"] });
        const longitudeColumn = _.findWhere(cols, { name: settings["map.longitude_column"] });

        const filter = [
            "inside",
            latitudeColumn.id, longitudeColumn.id,
            bounds.getNorth(), bounds.getWest(), bounds.getSouth(), bounds.getEast()
        ]

        setCardAndRun(updateIn(card, ["dataset_query", "query"], (query) => {
            const index = _.findIndex(Query.getFilters(query), (filter) =>
                mbqlEq(filter[0], "inside") && filter[1] === latitudeColumn.id && filter[2] === longitudeColumn.id
            );
            if (index >= 0) {
                return Query.updateFilter(query, index, filter);
            } else {
                return Query.addFilter(query, filter);
            }
        }));

        this.props.onFiltering(false);
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
