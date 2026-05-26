import type { MetricDimension, Timeline } from "metabase-types/api";

import type { ExplorationNavigation, ExplorationSelection } from "./hooks";
import type { ExplorationMetric } from "./types";

export function makeMockSelection(opts: {
  metrics?: ExplorationMetric[];
  dimensions?: MetricDimension[];
  timelines?: Timeline[];
}): ExplorationSelection {
  return {
    metrics: opts.metrics ?? [],
    dimensions: opts.dimensions ?? [],
    timelines: opts.timelines ?? [],
    name: "",
    setName: jest.fn(),
    setMetrics: jest.fn(),
    setDimensions: jest.fn(),
    setTimelines: jest.fn(),
    addMetric: jest.fn(),
    toggleMetric: jest.fn(),
    toggleDimension: jest.fn(),
    toggleTimeline: jest.fn(),
    addTimelinesById: jest.fn(),
    allTimelines: [],
    timelinesLoading: false,
    timelinesError: null,
  };
}

export function makeMockNavigation(): ExplorationNavigation {
  return {
    leftTab: "chat",
    setLeftTab: jest.fn(),
    browseTab: "metrics",
    setBrowseTab: jest.fn(),
    openBrowse: jest.fn(),
  };
}
