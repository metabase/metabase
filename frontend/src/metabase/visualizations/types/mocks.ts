import {
  createMockCard,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { VisualizationProps } from "./visualization";

export function createMockVisualizationProps(
  opts?: Partial<VisualizationProps>,
): VisualizationProps {
  return {
    card: createMockCard(),
    data: createMockDatasetData({}),
    series: [],
    rawSeries: [],
    settings: {},
    fontFamily: "Lato",
    isFullscreen: false,
    isQueryBuilder: false,
    isEmbeddingSdk: false,
    showTitle: false,
    isDashboard: false,
    isDocument: false,
    isVisualizer: false,
    isVisualizerCard: false,
    isEditing: false,
    isMetricsViewer: false,
    isMobile: false,
    isSettings: false,
    width: 500,
    height: 500,
    visualizationIsClickable: () => false,
    onRender: () => undefined,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange: () => undefined,
    onVisualizationClick: () => undefined,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: () => undefined,
    ...opts,
  };
}
