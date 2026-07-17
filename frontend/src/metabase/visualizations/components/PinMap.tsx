import cx from "classnames";
import * as d3 from "d3";
import L from "leaflet";
import { type ComponentClass, useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  DatasetData,
  PinMapType,
  RowValue,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

import { LeafletGridHeatMap } from "./LeafletGridHeatMap";
import type {
  LeafletMap,
  LeafletMapPoint,
  LeafletMapProps,
} from "./LeafletMap";
import { LeafletMarkerPinMap } from "./LeafletMarkerPinMap";
import { LeafletTilePinMap } from "./LeafletTilePinMap";
import S from "./PinMap.module.css";

const WORLD_BOUNDS: L.LatLngTuple[] = [
  [-90, -180],
  [90, 180],
];

// The map classes declare narrower prop types than what PinMap passes (the
// tile map takes 2-tuple points; the marker map's hover/click handlers don't
// accept null), so present them as accepting the shared child-props shape.
// "heat" is a legacy pin type with no renderer.
const MAP_COMPONENTS_BY_TYPE = {
  markers: LeafletMarkerPinMap,
  tiles: LeafletTilePinMap,
  grid: LeafletGridHeatMap,
} as Partial<Record<PinMapType, ComponentClass<PinMapChildProps>>>;

// A point is [latitude, longitude, metric]. For pin maps the metric can be
// null; grid/heat maps require it, so it's typed as a number here.
export type PinMapPoint = LeafletMapPoint<[number]>;

export interface GetPointsResult {
  rows: RowValues[];
  points: PinMapPoint[];
  bounds: L.LatLngBounds;
  min: number | undefined;
  max: number | undefined;
  warnings: string[];
}

interface GetPointsParams {
  data: DatasetData;
  latitudeColumnName?: string;
  longitudeColumnName?: string;
  metricColumnName?: string;
  isPinMap?: boolean;
}

export function getPoints({
  data: { cols, rows },
  latitudeColumnName,
  longitudeColumnName,
  metricColumnName,
  isPinMap = false,
}: GetPointsParams): GetPointsResult {
  const latitudeIndex = cols.findIndex(
    (col) => col.name === latitudeColumnName,
  );
  const longitudeIndex = cols.findIndex(
    (col) => col.name === longitudeColumnName,
  );
  const metricIndex = cols.findIndex((col) => col.name === metricColumnName);

  const allPoints = rows.map((row): [RowValue, RowValue, RowValue] => [
    row[latitudeIndex],
    row[longitudeIndex],
    metricIndex >= 0 ? row[metricIndex] : 1,
  ]);

  // only use points with numeric coordinates & metric
  const validPoints = allPoints.map(([lat, lng, metric]) => {
    if (isPinMap) {
      return lat != null && lng != null;
    }

    return lat != null && lng != null && metric != null;
  });
  // Valid points have non-null numeric lat/lng (and metric for non-pin maps).
  const points = allPoints.filter(
    (_point, i) => validPoints[i],
  ) as PinMapPoint[];
  const updatedRows = rows.filter((_row, i) => validPoints[i]);

  const warnings: string[] = [];
  const filteredRows = allPoints.length - points.length;
  if (filteredRows > 0) {
    warnings.push(
      t`We filtered out ${filteredRows} row(s) containing null values.`,
    );
  }

  const boundsPoints: L.LatLngTuple[] =
    points.length > 0
      ? points.map(([lat, lng]): L.LatLngTuple => [lat, lng])
      : WORLD_BOUNDS;
  const bounds = L.latLngBounds(boundsPoints);

  const min = d3.min(points, (point) => point[2]);
  const max = d3.max(points, (point) => point[2]);

  const binWidth = cols[longitudeIndex]?.binning_info?.bin_width;
  const binHeight = cols[latitudeIndex]?.binning_info?.bin_width;

  // Binned coordinates label the lower-left corner of each bin, so extend the
  // bounds by one bin to the north/east to keep the top/right bins in view.
  const northEast = bounds.getNorthEast();
  if (binWidth != null) {
    bounds.extend([northEast.lat, northEast.lng + binWidth]);
  }
  if (binHeight != null) {
    bounds.extend([northEast.lat + binHeight, northEast.lng]);
  }

  return { rows: updatedRows, points, bounds, min, max, warnings };
}

interface PinMapProps extends VisualizationProps {
  token?: string | null;
}

// Props PinMap forwards to whichever Leaflet map component is selected. The
// three components share LeafletMap's base props and each read a subset of the
// extras below.
type PinMapChildProps = LeafletMapProps<PinMapPoint> & {
  min?: number;
  max?: number;
  onHoverChange?: VisualizationProps["onHoverChange"] | null;
  onVisualizationClick?: VisualizationProps["onVisualizationClick"] | null;
  dashboard?: VisualizationProps["dashboard"];
  dashcard?: VisualizationProps["dashcard"];
};

export function PinMap(props: PinMapProps) {
  const {
    className,
    settings,
    series,
    isEditing,
    isDashboard,
    token,
    onRender,
    onUpdateVisualizationSettings,
    onRenderError,
  } = props;

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);

  const pointsInputs = {
    data: series[0].data,
    latitudeColumnName: settings["map.latitude_column"],
    longitudeColumnName: settings["map.longitude_column"],
    metricColumnName: settings["map.metric_column"],
  };
  const isPinMap = settings["map.type"] === "pin";

  // A new points identity makes LeafletMap refit the viewport to the data
  // bounds, so points must be recomputed only when the data or the mapped
  // columns change; `map.type` is read at recompute time but must not trigger
  // one, hence state adjusted during render instead of useMemo.
  const [pointsCache, setPointsCache] = useState(() => ({
    inputs: pointsInputs,
    result: getPoints({ ...pointsInputs, isPinMap }),
  }));
  const { inputs } = pointsCache;
  if (
    inputs.data !== pointsInputs.data ||
    inputs.latitudeColumnName !== pointsInputs.latitudeColumnName ||
    inputs.longitudeColumnName !== pointsInputs.longitudeColumnName ||
    inputs.metricColumnName !== pointsInputs.metricColumnName
  ) {
    setPointsCache({
      inputs: pointsInputs,
      result: getPoints({ ...pointsInputs, isPinMap }),
    });
  }
  const { rows, points, bounds, min, max, warnings } = pointsCache.result;

  // Report through onRender so Visualization merges these with its own
  // warnings (e.g. truncation) instead of overwriting them.
  useEffect(() => {
    onRender({ warnings });
  }, [onRender, warnings]);

  const handleMapRef = useCallback((instance: unknown) => {
    // Every entry in MAP_COMPONENTS_BY_TYPE is a LeafletMap subclass.
    setMapInstance(instance as LeafletMap | null);
  }, []);

  const updateSettings = () => {
    const newSettings: VisualizationSettings = {};
    if (lat != null) {
      newSettings["map.center_latitude"] = lat;
    }
    if (lng != null) {
      newSettings["map.center_longitude"] = lng;
    }
    if (zoom != null) {
      newSettings["map.zoom"] = zoom;
    }
    onUpdateVisualizationSettings(newSettings);
    setLat(null);
    setLng(null);
    setZoom(null);
  };

  const handleMapCenterChange = useCallback(
    (nextLat: number, nextLng: number) => {
      setLat(nextLat);
      setLng(nextLng);
    },
    [],
  );

  const handleRenderError = useCallback(
    (error?: unknown) => {
      onRenderError(error == null ? undefined : String(error));
    },
    [onRenderError],
  );

  const isStaticEmbedding = Boolean(token);

  const disableUpdateButton = lat == null && lng == null && zoom == null;

  const pinType = settings["map.pin_type"];
  const MapComponent = pinType ? MAP_COMPONENTS_BY_TYPE[pinType] : undefined;

  const mapProps = { ...props };
  mapProps.series[0].data.rows = rows;

  // For static embedding we hide the button
  const shouldShowDefaultViewChangeButton =
    !isStaticEmbedding && (isEditing || !isDashboard);

  return (
    <div
      data-element-id="pin-map"
      className={cx(
        className,
        DashboardS.PinMap,
        CS.relative,
        CS.hoverParent,
        CS.hoverVisibility,
      )}
      onMouseDownCapture={(e) => e.stopPropagation() /* prevent dragging */}
    >
      {MapComponent ? (
        <MapComponent
          {...mapProps}
          ref={handleMapRef}
          className={cx(
            CS.absolute,
            CS.top,
            CS.left,
            CS.bottom,
            CS.right,
            CS.z1,
          )}
          onMapCenterChange={handleMapCenterChange}
          onMapZoomChange={setZoom}
          onRenderError={handleRenderError}
          lat={lat}
          lng={lng}
          zoom={zoom}
          points={points}
          bounds={bounds}
          min={min}
          max={max}
          onFiltering={setFiltering}
          zoomControl={!(isDashboard && isEditing)}
          onHoverChange={isDashboard && isEditing ? null : props.onHoverChange}
          onVisualizationClick={
            isDashboard && isEditing ? null : props.onVisualizationClick
          }
        />
      ) : null}
      <div
        className={cx(
          CS.absolute,
          CS.top,
          CS.right,
          CS.m1,
          CS.z2,
          CS.flex,
          CS.flexColumn,
          CS.hoverChild,
        )}
      >
        {shouldShowDefaultViewChangeButton ? (
          <div
            className={cx(
              "PinMapUpdateButton",
              ButtonsS.Button,
              ButtonsS.ButtonSmall,
              ButtonsS.ButtonWhite,
              S.pinMapButton,
              {
                [DashboardS.PinMapUpdateButtonDisabled]: disableUpdateButton,
              },
            )}
            onClick={updateSettings}
          >
            {t`Set as default view`}
          </div>
        ) : null}
        {!isDashboard && mapInstance?.supportsFilter() && (
          <div
            className={cx(
              "PinMapUpdateButton",
              ButtonsS.Button,
              ButtonsS.ButtonSmall,
              ButtonsS.ButtonWhite,
              S.pinMapButton,
            )}
            onClick={() => {
              if (!mapInstance) {
                return;
              }
              if (filtering) {
                mapInstance.stopFilter();
              } else {
                mapInstance.startFilter();
              }
            }}
          >
            {filtering ? t`Cancel filter` : t`Draw box to filter`}
          </div>
        )}
      </div>
    </div>
  );
}
