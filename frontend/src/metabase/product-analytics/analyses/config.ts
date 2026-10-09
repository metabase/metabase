import { t } from "ttag";

import type {
  CardDisplayType,
  IconName,
  VisualizationSettings,
} from "metabase-types/api";

import type { AnalysisKind, AnalysisSpec, Granularity } from "../spec/types";
import { grainLabel } from "../sql/compile/grain";

export const ANALYSIS_KINDS = [
  "funnel",
  "paths",
  "habit",
  "lifecycle",
  "cohorts",
] as const satisfies readonly AnalysisKind[];

export const isAnalysisKind = (
  value: string | undefined,
): value is AnalysisKind =>
  value !== undefined && ANALYSIS_KINDS.some((kind) => kind === value);

export type AnalysisConfig = {
  kind: AnalysisKind;
  name: string;
  question: string;
  icon: IconName;
  setupLabel: string;
  granularity?: {
    units: Granularity[];
    get: (spec: AnalysisSpec) => Granularity;
    set: (spec: AnalysisSpec, unit: Granularity) => AnalysisSpec;
  };
  display: CardDisplayType;
  getVizSettings?: (spec: AnalysisSpec) => VisualizationSettings;
};

const setBucketGranularity = (
  spec: AnalysisSpec,
  unit: Granularity,
): AnalysisSpec => ({
  ...spec,
  bucket: { ...spec.bucket, granularity: unit },
});

const setLifecyclePeriod = (
  spec: AnalysisSpec,
  unit: Granularity,
): AnalysisSpec => {
  if (unit === "hour" || spec.lifecycle === undefined) {
    return spec;
  }
  return {
    ...spec,
    lifecycle: { ...spec.lifecycle, period: unit },
  };
};

const funnelSettings = (spec: AnalysisSpec): VisualizationSettings => {
  const metric = grainLabel(spec.grain);
  // Funnel viz reads these keys; they are not on VisualizationSettings yet.
  return {
    "funnel.dimension": "label",
    "funnel.metric": metric,
  } as VisualizationSettings;
};

export const ANALYSIS_CONFIG: Record<AnalysisKind, AnalysisConfig> = {
  funnel: {
    kind: "funnel",
    get name() {
      return t`Funnel`;
    },
    get question() {
      return t`Where do people fall out?`;
    },
    icon: "funnel",
    get setupLabel() {
      return t`Steps`;
    },
    granularity: {
      units: ["hour", "day", "week", "month"],
      get: (spec) => spec.bucket.granularity,
      set: setBucketGranularity,
    },
    display: "funnel",
    getVizSettings: funnelSettings,
  },
  paths: {
    kind: "paths",
    get name() {
      return t`Paths`;
    },
    get question() {
      return t`What steps did people take?`;
    },
    icon: "sankey",
    get setupLabel() {
      return t`Path`;
    },
    display: "sankey",
    getVizSettings: () => ({
      "sankey.source": "source",
      "sankey.target": "target",
      "sankey.value": "weight",
    }),
  },
  habit: {
    kind: "habit",
    get name() {
      return t`Habit`;
    },
    get question() {
      return t`How many days did a person show up?`;
    },
    icon: "bar",
    get setupLabel() {
      return t`Activity`;
    },
    display: "bar",
    getVizSettings: (spec) => ({
      "graph.dimensions": ["periods"],
      "graph.metrics": [grainLabel(spec.grain)],
    }),
  },
  lifecycle: {
    kind: "lifecycle",
    get name() {
      return t`Lifecycle`;
    },
    get question() {
      return t`Is the base growing or leaking?`;
    },
    icon: "lineandbar",
    get setupLabel() {
      return t`Activity`;
    },
    granularity: {
      units: ["day", "week", "month"],
      get: (spec) => spec.lifecycle?.period ?? spec.bucket.granularity,
      set: setLifecyclePeriod,
    },
    display: "bar",
    getVizSettings: () => ({
      "graph.dimensions": ["period", "state"],
      "graph.metrics": ["actors"],
      "stackable.stack_type": "stacked",
    }),
  },
  cohorts: {
    kind: "cohorts",
    get name() {
      return t`Cohorts`;
    },
    get question() {
      return t`Do people keep coming back?`;
    },
    icon: "grid",
    get setupLabel() {
      return t`Cohorts`;
    },
    granularity: {
      units: ["week", "month"],
      get: (spec) =>
        spec.bucket.granularity === "week" ||
        spec.bucket.granularity === "month"
          ? spec.bucket.granularity
          : "week",
      set: setBucketGranularity,
    },
    display: "table",
  },
};

export const getAnalysisConfig = (kind: AnalysisKind): AnalysisConfig =>
  ANALYSIS_CONFIG[kind];
