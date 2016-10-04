import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";
import categoryClusterIcon from "metabase/visualizations/lib/categoryClusterIcon";

import _ from "underscore";
import cx from "classnames";

import L from "leaflet/dist/leaflet-src.js";
import { PruneCluster, PruneClusterForLeaflet } from "imports?L=leaflet/dist/leaflet-src.js!exports?PruneCluster&PruneClusterForLeaflet!prunecluster/dist/PruneCluster.js";
import "Leaflet.vector-markers";

import "leaflet/dist/leaflet.css";
import "Leaflet.vector-markers/dist/leaflet-vector-markers.css";
import "PruneCluster/dist/LeafletStyleSheet.css"

import tinycolor from "tinycolor2";
import ColorHash from "color-hash";

const ch = new ColorHash();

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

    genMarker(color="#3090e9"){
        return L.VectorMarkers.icon({ markerColor: color });
    }

    getIndexes() {
        const { settings, series: [{ data: { cols }}] } = this.props;
        return {
            latitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.latitude_column"]),
            longitudeIndex: _.findIndex(cols, (col) => col.name === settings["map.longitude_column"]),
            categoryIndex: _.findIndex(cols, (col) => col.name === settings["map.category_column"])
        };
    }

    getTileUrl = (coord, zoom) => {
        const [{ card: { dataset_query }, data: { cols }}] = this.props.series;

        const { latitudeIndex, longitudeIndex } = this.getIndexes();
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

    genPopup(row, cols) {
        let popup = document.createElement("div");
        ReactDOM.render(<ObjectDetailTooltip row={row} cols={cols} />, popup);
        return popup
    }
    componentDidMount() {
        try {
            const element = ReactDOM.findDOMNode(this.refs.map);
            const { settings, series: [{ data }] } = this.props;

            const { latitudeIndex, longitudeIndex, categoryIndex } = this.getIndexes();

            let centerLatitude = settings["map.center_latitude"] || average(_.pluck(data.rows, latitudeIndex));
            let centerLongitude = settings["map.center_longitude"] || average(_.pluck(data.rows, longitudeIndex));

            let map = L.map(element).setView([centerLatitude, centerLongitude], settings["map.zoom"]);

            L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
                maxZoom: 18,
            }).addTo(map);

            let pruneCluster = new PruneClusterForLeaflet();

            let catColorMap;
            if (categoryIndex) {
                catColorMap = genCatColorMap(_.union(_.pluck(data.rows, categoryIndex)));

                pruneCluster.BuildLeafletClusterIcon = function(cluster) {
                    L.Icon.MarkerCluster = categoryClusterIcon(catColorMap);

                    let e = new L.Icon.MarkerCluster();
                    e.stats = cluster.stats;
                    e.population = cluster.population;
                    return e;
                };
            }

            map.addLayer(pruneCluster);

            for (let row of data.rows) {
                let marker = new PruneCluster.Marker(row[latitudeIndex], row[longitudeIndex]);

                if (categoryIndex){
                    let category = _.findWhere(catColorMap, {name: row[categoryIndex]})
                    marker.data.icon = this.genMarker(category.color);
                    marker.category = category.id;
                } else {
                    marker.data.icon = this.genMarker('#3090e9');
                }

                marker.data.popup = this.genPopup(row, data.cols);
                pruneCluster.RegisterMarker(marker);
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

const genColorCode = function(string){
    let color;
    let truthy = /^(?:yes|true|on|1|ok)$/i;
    let falsy = /^(?:no|false|off|0|wrong)$/i;
    if (_.isString(string)){
        if (string.search(truthy) > -1){
            color = "#c7f464"
        } else if (string.search(falsy) > -1){
            color = "#ea4444"
        }
    }
    return color ? color : tinycolor(ch.hex(string)).monochromatic()[3].toHexString()
}

const genCatColorMap = function(cats){
    return _.map(cats, (cat, index) => {
        return {'name': cat, 'color': genColorCode(cat), 'id': index}
    })
}

const average = function(list) {
    return _.reduce(list, (memo, num) => {return memo + num}, 0) / list.length;
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
