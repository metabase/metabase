import { registerAction } from "echarts/core";

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

// A clipped mark can touch the plot edge with nothing actually visible.
const EDGE_TOLERANCE = -0.5;

const hasMarkInsidePlotArea = (view: SeriesView, plotArea: PlotArea) => {
  let found = false;

  view.group.traverse((element) => {
    if (found) {
      return;
    }

    // Groups aggregate their children's bounds, so we compare against children instead
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
        let anythingRendered = false;

        ecModel.eachSeries((seriesModel) => {
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
