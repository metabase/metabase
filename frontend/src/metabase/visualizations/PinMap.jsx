import React, { Component, PropTypes } from "react";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import LeafletMarkerPinMap from "./components/LeafletMarkerPinMap.jsx";
import LeafletTilePinMap from "./components/LeafletTilePinMap.jsx";

import _ from "underscore";
import cx from "classnames";

import L from "leaflet";

const MAP_COMPONENTS_BY_TYPE = {
    "markers": LeafletMarkerPinMap,
    "tiles": LeafletTilePinMap,
}

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
            lng: null,
            zoom: null,
            ...this._getPoints(props)
        };
        _.bindAll(this, "onMapZoomChange", "onMapCenterChange", "updateSettings");
    }

    componentWillReceiveProps(newProps) {
        if (newProps.series[0].data !== this.props.series[0].data) {
            this.setState(this._getPoints(newProps))
        }
    }

    updateSettings() {
        let newSettings = {};
        if (this.state.lat != null) {
            newSettings["map.center_latitude"] = this.state.lat;
        }
        if (this.state.lng != null) {
            newSettings["map.center_longitude"] = this.state.lng;
        }
        if (this.state.zoom != null) {
            newSettings["map.zoom"] = this.state.zoom;
        }
        this.props.onUpdateVisualizationSettings(newSettings);
        this.setState({ lat: null, lng: null, zoom: null });
    }

    onMapCenterChange = (lat, lng) => {
        this.setState({ lat, lng });
    }

    onMapZoomChange = (zoom) => {
        this.setState({ zoom });
    }

    _getPoints(props) {
        const { settings, series: [{ data: { cols, rows }}] } = props;
        const latitudeIndex = _.findIndex(cols, (col) => col.name === settings["map.latitude_column"]);
        const longitudeIndex = _.findIndex(cols, (col) => col.name === settings["map.longitude_column"]);
        const points = rows.map(row => [
            row[latitudeIndex],
            row[longitudeIndex]
        ]);
        const bounds = L.latLngBounds(points);
        return { points, bounds };
    }

    render() {
        const { className, settings, isEditing, isDashboard } = this.props;
        let { lat, lng, zoom } = this.state;
        const disableUpdateButton = lat == null && lng == null && zoom == null;

        const Map = MAP_COMPONENTS_BY_TYPE[settings["map.pin_type"]];

        const { points, bounds } = this.state;//this._getPoints(this.props);

        return (
            <div className={className + " PinMap relative"} onMouseDownCapture={(e) =>e.stopPropagation() /* prevent dragging */}>
                { Map ?
                    <Map
                        {...this.props}
                        className="absolute top left bottom right z1"
                        onMapCenterChange={this.onMapCenterChange}
                        onMapZoomChange={this.onMapZoomChange}
                        lat={lat}
                        lng={lng}
                        zoom={zoom}
                        points={points}
                        bounds={bounds}
                    />
                : null }
                { isEditing || !isDashboard ?
                    <div className={cx("PinMapUpdateButton Button Button--small absolute top right m1 z2", { "PinMapUpdateButton--disabled": disableUpdateButton })} onClick={this.updateSettings}>
                        Save as default view
                    </div>
                : null }
            </div>
        );
    }
}
