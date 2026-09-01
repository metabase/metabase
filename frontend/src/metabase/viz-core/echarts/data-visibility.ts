import { registerAction } from "echarts/core";

export const DATA_VISIBILITY_ACTION = "metabaseCheckDataVisibility";
export const DATA_VISIBILITY_EVENT = "metabaseDataVisibility";

export type DataVisibilityResult = {
  anythingRendered: boolean;
};

// ECharts types event payloads as `unknown`, so listeners narrow with this.
export const isDataVisibilityResult = (
  value: unknown,
): value is DataVisibilityResult =>
  typeof value === "object" &&
  value !== null &&
  "anythingRendered" in value &&
  typeof value.anythingRendered === "boolean";

// `GlobalModel` / `ExtensionAPI` are internal to ECharts and not exported, so the
// handler's parameter types are derived from the registration function instead.
type ActionHandler = Parameters<typeof registerAction>[1];
type ExtensionApi = Parameters<NonNullable<ActionHandler>>[2];
type CoordinateSystem = ReturnType<
  ExtensionApi["getCoordinateSystems"]
>[number];
type CoordinateAxis = ReturnType<
  NonNullable<CoordinateSystem["getAxes"]>
>[number];
type SeriesView = ReturnType<ExtensionApi["getViewOfSeriesModel"]>;

type PlotArea = { x: number; y: number; width: number; height: number };

// A clipped mark can touch the plot edge with nothing actually visible.
const EDGE_TOLERANCE = 0.5;

// ECharts declares this on Axis2D but doesn't export it from "echarts/core".
type CartesianAxis = { toGlobalCoord(coord: number): number };

const isCartesianAxis = (
  axis: CoordinateAxis,
): axis is CoordinateAxis & CartesianAxis => "toGlobalCoord" in axis;

// `getRect()` lives on the concrete Grid but not on the CoordinateSystemMaster
// interface, so the plot box is rebuilt from the span of its two axes.
const getPlotArea = (coordinateSystem: CoordinateSystem): PlotArea | null => {
  const axes = coordinateSystem.getAxes?.();
  const xAxis = axes?.find((axis) => axis.dim === "x");
  const yAxis = axes?.find((axis) => axis.dim === "y");

  if (!xAxis || !yAxis || !isCartesianAxis(xAxis) || !isCartesianAxis(yAxis)) {
    return null;
  }

  // Axis extents are coordinate-system-local; element bounds are global.
  const xExtent = xAxis.getExtent();
  const yExtent = yAxis.getExtent();
  const left = xAxis.toGlobalCoord(xExtent[0]);
  const right = xAxis.toGlobalCoord(xExtent[1]);
  const top = yAxis.toGlobalCoord(yExtent[0]);
  const bottom = yAxis.toGlobalCoord(yExtent[1]);

  return {
    x: Math.min(left, right) + EDGE_TOLERANCE,
    y: Math.min(top, bottom) + EDGE_TOLERANCE,
    width: Math.abs(right - left) - EDGE_TOLERANCE * 2,
    height: Math.abs(bottom - top) - EDGE_TOLERANCE * 2,
  };
};

const hasMarkInsidePlotArea = (view: SeriesView, plotArea: PlotArea) => {
  let found = false;

  view.group.traverse((element) => {
    if (found) {
      return;
    }

    // Groups aggregate their children's bounds, so only leaves are real marks.
    if (element.isGroup || element.ignore) {
      return;
    }

    const bounds = element.getBoundingRect().clone();
    if (element.transform) {
      bounds.applyTransform(element.transform);
    }

    if (bounds.intersect(plotArea)) {
      found = true;
    }
  });

  return found;
};

export const DataVisibilityExtension = {
  install: () => {
    registerAction(
      {
        type: DATA_VISIBILITY_ACTION,
        event: DATA_VISIBILITY_EVENT,
        // Without this the dispatch would re-render, re-firing `rendered` and
        // dispatching again forever.
        update: "none",
      },
      (_payload, ecModel, api): DataVisibilityResult => {
        const [coordinateSystem] = api.getCoordinateSystems();
        const plotArea = coordinateSystem
          ? getPlotArea(coordinateSystem)
          : null;

        if (!plotArea) {
          return { anythingRendered: true };
        }

        let anythingRendered = false;

        ecModel.eachSeries((seriesModel) => {
          const view = api.getViewOfSeriesModel(seriesModel);
          anythingRendered =
            anythingRendered || hasMarkInsidePlotArea(view, plotArea);
        });

        return { anythingRendered };
      },
    );
  },
};
