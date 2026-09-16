import { registerAction } from "echarts/core";
// `instanceof` only matches ECharts' own zrender copy, so keep zrender pinned to ECharts' version.
import Path from "zrender/lib/graphic/Path.js";

import { GOAL_LINE_SERIES_ID } from "./cartesian/constants/dataset";

export const DATA_VISIBILITY_ACTION = "metabaseCheckDataVisibility";
export const DATA_VISIBILITY_EVENT = "metabaseDataVisibility";

type DataVisibilityResult = {
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

type ActionHandler = Parameters<typeof registerAction>[1];
type ExtensionApi = Parameters<NonNullable<ActionHandler>>[2];
type SeriesView = ReturnType<ExtensionApi["getViewOfSeriesModel"]>;

type PlotArea = { x: number; y: number; width: number; height: number };

// Area charts sill draw a line for a 0 value
const EDGE_TOLERANCE = -0.5;

// We want to ignore goal lines for this calculation
const isGoalLineSeries = (seriesId: string) =>
  seriesId === GOAL_LINE_SERIES_ID ||
  seriesId.startsWith(`${GOAL_LINE_SERIES_ID}_`);

const isTransparent = (path: Path) => path.style.opacity === 0;

// zrender pads stroke-only paths out to a hit area that reaches well past the painted line.
const getPaintedBounds = (path: Path) => {
  const bounds = path.getBoundingRect().clone();

  if (!path.hasStroke() || path.hasFill()) {
    return bounds;
  }

  const lineWidth = path.style.lineWidth ?? 1;
  const hitAreaInset =
    (Math.max(lineWidth, path.strokeContainThreshold) - lineWidth) / 2;

  bounds.x += hitAreaInset;
  bounds.y += hitAreaInset;
  bounds.width -= hitAreaInset * 2;
  bounds.height -= hitAreaInset * 2;

  return bounds;
};

const hasMarkInsidePlotArea = (view: SeriesView, plotArea: PlotArea) => {
  let found = false;

  view.group.traverse((element) => {
    if (found) {
      return true;
    }

    const path = element instanceof Path ? element : null;

    // Groups aggregate their children's bounds, so we compare against children instead
    if (element.isGroup || element.ignore || (path && isTransparent(path))) {
      return;
    }

    const bounds = path
      ? getPaintedBounds(path)
      : element.getBoundingRect().clone();
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
        let anythingRendered = false;

        ecModel.eachSeries((seriesModel) => {
          if (isGoalLineSeries(seriesModel.id)) {
            return;
          }

          const plotArea =
            seriesModel.coordinateSystem?.getArea?.(EDGE_TOLERANCE);

          if (!plotArea) {
            anythingRendered = true;
            return;
          }

          const view = api.getViewOfSeriesModel(seriesModel);
          anythingRendered =
            anythingRendered || hasMarkInsidePlotArea(view, plotArea);
        });

        return { anythingRendered };
      },
    );
  },
};
