import React from "react";
import ReactDOM from "react-dom";

import LeafletMap from "./LeafletMap.jsx";
import L from "leaflet";

import { formatValue } from "metabase/lib/formatting";

const MARKER_ICON = L.icon({
    iconUrl: "/app/img/pin.png",
    iconSize: [28, 32],
    iconAnchor: [15, 24],
    popupAnchor: [0, -13]
});

export default class LeafletMarkerPinMap extends LeafletMap {
    componentDidMount() {
        super.componentDidMount();

        this.pinMarkerLayer = L.layerGroup([]).addTo(this.map);
        this.componentDidUpdate({}, {});
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);

        try {
            const { pinMarkerLayer } = this;
            const { points } = this.props;

            let markers = pinMarkerLayer.getLayers();
            let max = Math.max(points.length, markers.length);
            for (let i = 0; i < max; i++) {
                if (i >= points.length) {
                    pinMarkerLayer.removeLayer(markers[i]);
                }
                if (i >= markers.length) {
                    const marker = this._createMarker(i);
                    pinMarkerLayer.addLayer(marker);
                    markers.push(marker);
                }

                if (i < points.length) {
                    const { lat, lng } = markers[i].getLatLng();
                    if (lng !== points[i][0] || lat !== points[i][1]) {
                        markers[i].setLatLng(points[i]);
                    }
                }
            }
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
