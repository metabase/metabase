import * as d3 from "d3";
import L from "leaflet";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isMetric, isNumeric } from "metabase-lib/v1/types/utils/isa";

import { computeNumericDataInterval } from "../lib/numeric";

import { LeafletMap } from "./LeafletMap";

const isValidCoordinatesColumn = (column) =>
  column.binning_info || (column.source === "native" && isNumeric(column));

export class LeafletGridHeatMap extends LeafletMap {
  static isSensible({ cols }) {
    return (
      cols.filter(isValidCoordinatesColumn).length >= 2 &&
      cols.filter(isMetric).length > 0
    );
  }

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
      if (
        !isValidCoordinatesColumn(latitudeColumn) ||
        !isValidCoordinatesColumn(longitudeColumn)
      ) {
        throw new Error(t`Grid map requires binned longitude/latitude.`);
      }

      const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();

      const successColor = d3.rgb(color("success"));
      const errorColor = d3.rgb(color("error"));

      const colorScale = d3
        .scaleLinear([min, max], [successColor, errorColor])
        .interpolate(d3.interpolateHcl);

      const gridSquares = gridLayer.getLayers();
      const totalSquares = Math.max(points.length, gridSquares.length);

      const latitudeValues = points.map((row) => row[latitudeIndex]);
      const longitudeValues = points.map((row) => row[longitudeIndex]);

      const latitudeBinning =
        latitudeColumn?.binning_info?.bin_width ??
        computeNumericDataInterval(latitudeValues);

      const longitudeBinning =
        longitudeColumn?.binning_info?.bin_width ??
        computeNumericDataInterval(longitudeValues);

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
          const [latitude, longitude, metric] = points[i];

          gridSquares[i].setStyle({ color: colorScale(metric) });

          const latMin = latitude;
          const latMax = latitude + latitudeBinning;

          const lonMin = longitude;
          const lonMax = longitude + longitudeBinning;

          gridSquares[i].setBounds([
            [latMin, lonMin],
            [latMax, lonMax],
          ]);
        }
      }
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  supportsFilter() {
    const {
      series: [{ card }],
      metadata,
      token,
    } = this.props;

    const isStaticEmbedding = !!token;

    if (isStaticEmbedding) {
      return false;
    }

    const question = new Question(card, metadata);
    const { isNative } = Lib.queryDisplayInfo(question.query());
    return !isNative;
  }

  _createGridSquare = (index) => {
    const bounds = [
      [54.559322, -5.767822],
      [56.1210604, -3.02124],
    ];
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
