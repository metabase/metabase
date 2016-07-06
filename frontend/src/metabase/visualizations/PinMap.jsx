/*global PruneClusterForLeaflet*/
/*global PruneCluster*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { getSettingsForVisualization, setLatitudeAndLongitude, setCategory } from "metabase/lib/visualization_settings";
import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";
import categoryClusterIcon from "metabase/visualizations/lib/categoryClusterIcon";

import _ from "underscore";
import cx from "classnames";
import L from "leaflet";
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

    genMarker(color="#3090e9"){
        return L.VectorMarkers.icon({ markerColor: color });
    }

    genPopup(row, cols) {
        let popup = document.createElement("div");
        ReactDOM.render(<ObjectDetailTooltip row={row} cols={cols} />, popup);
        return popup
    }
    componentDidMount() {
        try {
            let element = ReactDOM.findDOMNode(this.refs.map);
            let { card, data } = this.props.series[0];
            let settings = card.visualization_settings;

            settings = getSettingsForVisualization(settings, "pin_map");
            settings = setLatitudeAndLongitude(settings, data.cols);
            settings = setCategory(settings, data.cols);

            let {
                center_latitude,
                center_longitude,
                latitude_dataset_col_index: latColIndex,
                longitude_dataset_col_index: lonColIndex,
                category_dataset_col_index: catColIndex,
            } = settings.map;

            center_latitude = center_latitude ? center_latitude : average(_.pluck(data.rows, latColIndex));
            center_longitude = center_longitude ? center_longitude : average(_.pluck(data.rows, lonColIndex));

            let map = L.map(element).setView([center_latitude, center_longitude], settings.map.zoom);

            L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
                maxZoom: 18,
            }).addTo(map);

            let pruneCluster = new PruneClusterForLeaflet();

            let catColorMap;
            if (catColIndex) {
                catColorMap = genCatColorMap(_.union(_.pluck(data.rows, catColIndex)));

                pruneCluster.BuildLeafletClusterIcon = function(cluster) {
                    L.Icon.MarkerCluster = categoryClusterIcon(catColorMap);

                    let e = new L.Icon.MarkerCluster();
                    e.stats = cluster.stats;
                    e.population = cluster.population;
                    return e;
                };
            }

            for (let row of data.rows) {
                let marker = new PruneCluster.Marker(row[latColIndex], row[lonColIndex]);

                if(catColIndex){
                    let category = _.findWhere(catColorMap, {name: row[catColIndex]})
                    marker.data.icon = this.genMarker(category.color);
                    marker.category = category.id;
                } else {
                    marker.data.icon = this.genMarker('#3090e9');
                }

                marker.data.popup = this.genPopup(row, data.cols);
                pruneCluster.RegisterMarker(marker);
            }

            map.addLayer(pruneCluster);

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
