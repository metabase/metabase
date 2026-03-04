import * as d3 from "d3";
import L from "leaflet";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ClickObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isMetric, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import { computeNumericDataInterval } from "../lib/numeric";

import {
  LeafletMap,
  type LeafletMapPoint,
  type LeafletMapProps,
} from "./LeafletMap";

type GridHeatPoint = LeafletMapPoint<[number]>;

type GridHeatMapSeries = LeafletMapProps["series"][number] & {
  data: {
    rows: RowValue[][];
    cols: DatasetColumn[];
  };
};

type LeafletGridHeatMapProps = LeafletMapProps<GridHeatPoint> & {
  min?: number;
  max?: number;
  onVisualizationClick?: ((clickObject: ClickObject | null) => void) | null;
  onHoverChange?: ((hoverObject: ClickObject | null) => void) | null;
};

const isValidCoordinatesColumn = (column: DatasetColumn | undefined) =>
  !!column &&
  (column.binning_info != null ||
    (column.source === "native" && isNumeric(column)));

export class LeafletGridHeatMap extends LeafletMap<LeafletGridHeatMapProps> {
  gridLayer: L.LayerGroup | null = null;

  static isSensible({ cols }: { cols: DatasetColumn[] }) {
    return (
      cols.filter(isValidCoordinatesColumn).length >= 2 &&
      cols.filter(isMetric).length > 0
    );
  }

  componentDidMount() {
    super.componentDidMount();

    if (!this.map) {
      return;
    }

    this.gridLayer = L.layerGroup([]).addTo(this.map);
    this.syncGridLayer();
  }

  componentDidUpdate(prevProps: LeafletGridHeatMapProps) {
    super.componentDidUpdate(prevProps);
    this.syncGridLayer();
  }

  private syncGridLayer() {
    try {
      const { gridLayer } = this;
      if (!gridLayer) {
        return;
      }

      const points = this.props.points ?? [];
      const { min, max } = this.props;
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
        .scaleLinear([min ?? 0, max ?? 0], [successColor, errorColor])
        .interpolate(d3.interpolateHcl);

      const gridSquares = gridLayer.getLayers().filter(isRectangleLayer);
      const totalSquares = Math.max(points.length, gridSquares.length);

      const latitudeValues = points.map((row) => row[latitudeIndex]);
      const longitudeValues = points.map((row) => row[longitudeIndex]);

      const latitudeBinning =
        latitudeColumn.binning_info?.bin_width ??
        computeNumericDataInterval(latitudeValues);

      const longitudeBinning =
        longitudeColumn.binning_info?.bin_width ??
        computeNumericDataInterval(longitudeValues);

      for (let index = 0; index < totalSquares; index++) {
        if (index >= points.length) {
          gridLayer.removeLayer(gridSquares[index]);
        }

        if (index >= gridSquares.length) {
          const gridSquare = this._createGridSquare(index);
          gridLayer.addLayer(gridSquare);
          gridSquares.push(gridSquare);
        }

        if (index < points.length) {
          const [latitude, longitude, metric] = points[index];
          const gridSquare = gridSquares[index];

          gridSquare.setStyle({ color: colorScale(metric) });

          const latMin = latitude;
          const latMax = latitude + latitudeBinning;

          const lonMin = longitude;
          const lonMax = longitude + longitudeBinning;

          gridSquare.setBounds([
            [latMin, lonMin],
            [latMax, lonMax],
          ]);
        }
      }
    } catch (error) {
      console.error(error);
      this.props.onRenderError(error instanceof Error ? error.message : error);
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

  _createGridSquare = (index: number): L.Rectangle => {
    const bounds: L.LatLngBoundsLiteral = [
      [54.559322, -5.767822],
      [56.1210604, -3.02124],
    ];
    const gridSquare = L.rectangle(bounds, {
      color: "red",
      weight: 1,
      stroke: true,
      fillOpacity: 0.5,
    });
    gridSquare.on("click", this._onVisualizationClick.bind(this, index));
    gridSquare.on("mousemove", this._onHoverChange.bind(this, index));
    gridSquare.on("mouseout", this._onHoverChange.bind(this, null));
    return gridSquare;
  };

  _clickForPoint(index: number, e: L.LeafletMouseEvent): ClickObject {
    const { settings, series } = this.props;
    const points = this.props.points ?? [];
    const point = points[index];
    const metricColumn = this._getMetricColumn();
    const { latitudeColumn, longitudeColumn } = this._getLatLonColumns();
    const seriesEntry = series[0];
    const origin = hasRowsInSeries(seriesEntry)
      ? { row: seriesEntry.data.rows[index], cols: seriesEntry.data.cols }
      : undefined;

    return {
      value: point?.[2],
      column: metricColumn,
      dimensions: [
        {
          value: point?.[0],
          column: latitudeColumn,
        },
        {
          value: point?.[1],
          column: longitudeColumn,
        },
      ],
      event: e.originalEvent,
      origin,
      settings,
    };
  }

  _onVisualizationClick(index: number, e: L.LeafletMouseEvent) {
    const { onVisualizationClick } = this.props;
    if (onVisualizationClick) {
      onVisualizationClick(this._clickForPoint(index, e));
    }
  }

  _onHoverChange(index: number | null, e: L.LeafletMouseEvent) {
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

function isRectangleLayer(layer: L.Layer): layer is L.Rectangle {
  return layer instanceof L.Rectangle;
}

function hasRowsInSeries(
  series: LeafletMapProps["series"][number] | undefined,
): series is GridHeatMapSeries {
  return !!series && "rows" in series.data && Array.isArray(series.data.rows);
}
