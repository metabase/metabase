import * as d3 from "d3";
import L from "leaflet";
import { t } from "ttag";

import { color } from "metabase/ui/colors";
import type { ClickObject, HoveredObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isMetric, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { computeNumericDataInterval } from "../lib/numeric";

import {
  LeafletMap,
  type LeafletMapPoint,
  type LeafletMapProps,
  MAP_SELECTION_DURATION,
  getClickedRowIndex,
} from "./LeafletMap";

type GridHeatPoint = LeafletMapPoint<[number]>;

type LeafletGridHeatMapProps = LeafletMapProps<GridHeatPoint> & {
  min?: number;
  max?: number;
  onVisualizationClick?: ((clickObject: ClickObject | null) => void) | null;
  onHoverChange?: ((hoverObject: HoveredObject | null) => void) | null;
};

const isValidCoordinatesColumn = (column: DatasetColumn | undefined) =>
  !!column &&
  (column.binning_info != null ||
    (column.source === "native" && isNumeric(column)));

export class LeafletGridHeatMap extends LeafletMap<LeafletGridHeatMapProps> {
  gridLayer: L.LayerGroup | null = null;
  selectionTimeoutId: number | null = null;

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
    this.syncSelectionLayer();
  }

  componentDidUpdate(prevProps: LeafletGridHeatMapProps) {
    super.componentDidUpdate(prevProps);
    this.syncGridLayer();
    if (
      prevProps.clicked !== this.props.clicked ||
      prevProps.clickedViaMention !== this.props.clickedViaMention ||
      prevProps.points !== this.props.points
    ) {
      this.syncSelectionLayer();
    }
  }

  componentWillUnmount() {
    if (this.selectionTimeoutId != null) {
      window.clearTimeout(this.selectionTimeoutId);
    }
    super.componentWillUnmount();
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

      const colorScale =
        min == null || max == null
          ? d3
              .scaleLinear([successColor, errorColor])
              .interpolate(d3.interpolateHcl)
          : d3
              .scaleLinear([min, max], [successColor, errorColor])
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
    (
      gridSquare as L.Rectangle & { _metabaseRowIndex?: number }
    )._metabaseRowIndex = index;
    gridSquare.on("click", this._onVisualizationClick.bind(this, index));
    gridSquare.on("mousemove", this._onHoverChange.bind(this, index));
    gridSquare.on("mouseout", this._onHoverChange.bind(this, null));
    return gridSquare;
  };

  _clickForPoint(index: number, e: L.LeafletMouseEvent) {
    const { settings, series } = this.props;
    const points = this.props.points ?? [];
    const point = points[index];
    const metricColumn = this._getMetricColumn();
    const { latitudeColumn, longitudeColumn } = this._getLatLonColumns();
    const seriesEntry = series[0];
    const rows = seriesEntry.data.rows;
    const origin = { row: rows[index], cols: seriesEntry.data.cols };

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
    } satisfies ClickObject;
  }

  _onVisualizationClick(index: number, e: L.LeafletMouseEvent) {
    const { onVisualizationClick } = this.props;
    if (onVisualizationClick) {
      onVisualizationClick(this._clickForPoint(index, e));
    }
  }

  _onHoverChange(index: number | null, event: L.LeafletMouseEvent) {
    const { onHoverChange } = this.props;
    if (onHoverChange) {
      if (index == null) {
        onHoverChange(null);
      } else {
        const hoveredObject = this._clickForPoint(
          index,
          event,
        ) satisfies HoveredObject;
        onHoverChange(hoveredObject);
      }
    }
  }

  private syncSelectionLayer() {
    if (this.selectionTimeoutId != null) {
      window.clearTimeout(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
    }

    const gridSquares = this.gridLayer?.getLayers().filter(isRectangleLayer);
    if (!gridSquares) {
      return;
    }

    const rows = this.props.series[0].data.rows;
    const selectedRowIndex = getClickedRowIndex(
      rows,
      this.props.clickedViaMention ?? this.props.clicked,
    );
    this.applyGridSelection(
      gridSquares,
      selectedRowIndex,
      this.props.clickedViaMention != null,
    );

    if (selectedRowIndex != null) {
      this.selectionTimeoutId = window.setTimeout(() => {
        this.applyGridSelection(gridSquares, null, false);
        this.selectionTimeoutId = null;
      }, MAP_SELECTION_DURATION);
    }
  }

  private applyGridSelection(
    gridSquares: L.Rectangle[],
    selectedRowIndex: number | null,
    selectedViaMention: boolean,
  ) {
    for (const gridSquare of gridSquares) {
      const rowIndex = (
        gridSquare as L.Rectangle & { _metabaseRowIndex?: number }
      )._metabaseRowIndex;
      const isSelected =
        selectedRowIndex != null && rowIndex === selectedRowIndex;

      gridSquare.setStyle({
        fillOpacity: selectedRowIndex == null ? 0.5 : isSelected ? 0.85 : 0.15,
        opacity: selectedRowIndex == null || isSelected ? 1 : 0.3,
        weight: isSelected ? 3 : 1,
        dashArray: isSelected && selectedViaMention ? "4" : "",
      });
      if (isSelected) {
        gridSquare.bringToFront();
      }
    }
  }
}

function isRectangleLayer(layer: L.Layer): layer is L.Rectangle {
  return layer instanceof L.Rectangle;
}
