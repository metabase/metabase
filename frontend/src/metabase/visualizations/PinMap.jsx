import React, { Component, PropTypes } from "react";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import LeafletMarkerPinMap from "./components/LeafletMarkerPinMap.jsx";
import LeafletTilePinMap from "./components/LeafletTilePinMap.jsx";

import _ from "underscore";
import cx from "classnames";

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

    onMapCenterChange = (lat, lon) => {
        this.setState({ lat, lon });
    }

    onMapZoomChange = (zoom) => {
        this.setState({ zoom });
    }

    render() {
        const { className, settings, isEditing, isDashboard } = this.props;
        const { lat, lon, zoom } = this.state;
        const disableUpdateButton = lat == null && lon == null && zoom == null;

        const Map = MAP_COMPONENTS_BY_TYPE[settings["map.pin_type"]];

        return (
            <div className={className + " PinMap relative"} onMouseDownCapture={(e) =>e.stopPropagation() /* prevent dragging */}>
                { Map ?
                    <Map
                        {...this.props}
                        className="absolute top left bottom right z1"
                        onMapCenterChange={this.onMapCenterChange}
                        onMapZoomChange={this.onMapZoomChange}
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
