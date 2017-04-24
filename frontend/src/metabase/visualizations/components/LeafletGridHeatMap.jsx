import LeafletMap from "./LeafletMap.jsx";
import L from "leaflet";

import d3 from "d3";

export default class LeafletGridHeatMap extends LeafletMap {
    componentDidMount() {
        super.componentDidMount();

        this.gridLayer = L.layerGroup([]).addTo(this.map);
        this.componentDidUpdate({}, {});
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);

        try {
            const { gridLayer } = this;
            let { points, min, max, binWidth, binHeight } = this.props;

            const color = d3.scale.linear().domain([min,max])
                .interpolate(d3.interpolateHcl)
                .range([d3.rgb("#00FF00"), d3.rgb('#FF0000')]);

            let gridSquares = gridLayer.getLayers();
            let totalSquares = Math.max(points.length, gridSquares.length);
            for (let i = 0; i < totalSquares; i++) {
                if (i >= points.length) {
                    gridLayer.removeLayer(gridSquares[i]);
                }
                if (i >= gridSquares.length) {
                    const gridSquare = this._createGridSquare(i);
                    gridLayer.addLayer(gridSquare);
                    gridSquares.push(gridSquare);
                }

                if (i < points.length) {
                    gridSquares[i].setStyle({ color: color(points[i][2]) });
                    gridSquares[i].setBounds([
                        [points[i][0] - binHeight / 2, points[i][1] - binWidth / 2],
                        [points[i][0] + binHeight / 2, points[i][1] + binWidth / 2]
                    ]);
                }
            }
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    _createGridSquare = (index) => {
        var bounds = [[54.559322, -5.767822], [56.1210604, -3.021240]];
        return L.rectangle(bounds, {
            color: "red",
            weight: 1,
            stroke: false,
            fillOpacity: 0.5
        })
    }
}
