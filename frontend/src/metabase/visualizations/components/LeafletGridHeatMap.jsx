import LeafletMap from "./LeafletMap";
import L from "leaflet";
import { t } from "ttag";
import d3 from "d3";

import { rangeForValue } from "metabase/lib/dataset";
import { color } from "metabase/lib/colors";

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
      const { points, min, max } = this.props;

      const { latitudeColumn, longitudeColumn } = this._getLatLonColumns();
      if (!latitudeColumn.binning_info || !longitudeColumn.binning_info) {
        throw new Error(t`Grid map requires binned longitude/latitude.`);
      }

      const colorScale = d3.scale
        .linear()
        .domain([min, max])
        .interpolate(d3.interpolateHcl)
        .range([d3.rgb(color("success")), d3.rgb(color("error"))]);

      const gridSquares = gridLayer.getLayers();
      const totalSquares = Math.max(points.length, gridSquares.length);
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
          gridSquares[i].setStyle({ color: colorScale(points[i][2]) });
          const [latMin, latMax] = rangeForValue(points[i][0], latitudeColumn);
          const [lonMin, lonMax] = rangeForValue(points[i][1], longitudeColumn);
          gridSquares[i].setBounds([[latMin, lonMin], [latMax, lonMax]]);
        }
      }
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  _createGridSquare = index => {
    const bounds = [[54.559322, -5.767822], [56.1210604, -3.02124]];
    const gridSquare = L.rectangle(bounds, {
      color: "red",
      weight: 1,
      stroke: true,
      fillOpacity: 0.5,
      strokeOpacity: 1.0,
    });
    gridSquare.on("click", this._onVisualizationClick.bind(this, index));
    gridSquare.on("mousemove", this._onHoverChange.bind(this, index));
    gridSquare.on("mouseout", this._onHoverChange.bind(this, null));
    return gridSquare;
  };

  _clickForPoint(index, e) {
    const {
      points,
      settings,
      series: [
        {
          data: { rows, cols },
        },
      ],
    } = this.props;
    const point = points[index];
    const metricColumn = this._getMetricColumn();
    const { latitudeColumn, longitudeColumn } = this._getLatLonColumns();
    return {
      value: point[2],
      column: metricColumn,
      dimensions: [
        {
          value: point[0],
          column: latitudeColumn,
        },
        {
          value: point[1],
          column: longitudeColumn,
        },
      ],
      event: e.originalEvent,
      origin: { row: rows[index], cols },
      settings,
    };
  }

  _onVisualizationClick(index, e) {
    const { onVisualizationClick } = this.props;
    if (onVisualizationClick) {
      onVisualizationClick(this._clickForPoint(index, e));
    }
  }

  _onHoverChange(index, e) {
    const { onHoverChange } = this.props;
    if (onHoverChange) {
      if (index == null) {
        onHoverChange(null);
      } else {
        onHoverChange(this._clickForPoint(index, e));
      }
    }
  }
}
