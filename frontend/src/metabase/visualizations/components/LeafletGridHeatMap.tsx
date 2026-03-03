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

import { LeafletMap, type LeafletMapProps } from "./LeafletMap";

type GridHeatPoint = [number, number, number];

type GridHeatMapSeries = LeafletMapProps["series"][number] & {
  data: {
    rows: RowValue[][];
    cols: DatasetColumn[];
  };
};

type LeafletGridHeatMapProps = Omit<
  LeafletMapProps,
  "points" | "onVisualizationClick" | "onHoverChange"
> & {
  points?: GridHeatPoint[] | null;
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
    this.componentDidUpdate(this.props as unknown as LeafletMapProps);
  }

  componentDidUpdate(prevProps: LeafletMapProps) {
    super.componentDidUpdate(prevProps);

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

      const gridSquares = gridLayer.getLayers() as L.Rectangle[];
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
      strokeOpacity: 1.0,
    } as L.PathOptions);
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
    const seriesEntry = series[0] as GridHeatMapSeries;
    const { rows, cols } = seriesEntry.data;

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
      origin: { row: rows[index], cols },
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
