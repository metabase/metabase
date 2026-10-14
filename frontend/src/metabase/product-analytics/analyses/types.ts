import type {
  CardDisplayType,
  Table,
  VisualizationSettings,
} from "metabase-types/api";

import type { ColumnRole } from "../columns";
import type { EventDefinition, EventFlags } from "../events/types";
import type { SettingDefinitions } from "../settings/types";
import type {
  AnalysisKind,
  AnalysisSpec,
  CohortsSpec,
  Duration,
  FunnelSpec,
  Grain,
  Granularity,
  HabitSpec,
  LifecycleStateName,
  OutputSpec,
  PathsSpec,
} from "../spec/types";

/** Facts the settings are computed from. Choices belong in settings. */
export type AnalysisContext = {
  table: Table | undefined;
};

export type ColumnRoleSettings = {
  [R in ColumnRole as `columns.${R}`]: string | null;
};

export type CommonSettings = ColumnRoleSettings & {
  counting: Grain;
  /** A serialized date filter, e.g. "past90days". See `date-range.ts`. */
  date_range: string;
  granularity: Granularity;
};

export type FunnelSettings = CommonSettings & {
  "funnel.steps": EventDefinition[];
  "funnel.view": NonNullable<OutputSpec["funnelView"]>;
  "funnel.window": Duration;
  "funnel.ordering": FunnelSpec["ordering"];
  "funnel.anchor": FunnelSpec["anchor"];
  "funnel.allow_retry": boolean;
};

export type PathsSettings = CommonSettings & {
  "paths.direction": PathsSpec["direction"];
  "paths.start": EventDefinition | null;
  "paths.end": EventDefinition | null;
  "paths.steps": number;
  "paths.included": EventDefinition[];
  "paths.session_gap_minutes": number;
  "paths.merge_repeats": boolean;
  "paths.hide_noisy_events": boolean;
  "paths.max_nodes": number;
  "paths.min_volume": number;
  "paths.edge_metric": NonNullable<OutputSpec["pathsEdgeMetric"]>;
};

export type HabitSettings = CommonSettings & {
  "habit.active": EventDefinition | null;
  "habit.lookback": Duration;
  "habit.sub_period": HabitSpec["subPeriod"];
  "habit.measure": HabitSpec["measure"];
  "habit.threshold": number;
};

export type LifecycleSettings = CommonSettings & {
  "lifecycle.active": EventDefinition | null;
  "lifecycle.shown": LifecycleStateName[];
};

export type CohortsSettings = CommonSettings & {
  "cohorts.start": EventDefinition | null;
  "cohorts.return": EventDefinition | null;
  "cohorts.return_rule": CohortsSpec["returnRule"];
  "cohorts.horizon": number;
  "cohorts.row_mode": CohortsSpec["rowMode"];
  "cohorts.start_periods": number;
  "cohorts.display": NonNullable<OutputSpec["cohortsDisplay"]>;
};

export type AnalysisSettingsByKind = {
  funnel: FunnelSettings;
  paths: PathsSettings;
  habit: HabitSettings;
  lifecycle: LifecycleSettings;
  cohorts: CohortsSettings;
};

export type AnalysisSettingDefinitions<S> = SettingDefinitions<
  AnalysisContext,
  S
>;

/** A setting that needs a value before the analysis can run. */
export type MissingSetting = {
  key: string;
  message: string;
};

/** Settings are incomplete until every event the analysis needs is chosen. */
export type SpecResult =
  | { status: "ready"; spec: AnalysisSpec }
  | { status: "incomplete"; missing: MissingSetting[] };

export type AnalysisConfig<K extends AnalysisKind> = {
  kind: K;
  readonly name: string;
  readonly question: string;
  readonly setupLabel: string;
  settings: SettingDefinitions<AnalysisContext, AnalysisSettingsByKind[K]>;
  toSpec: (
    settings: AnalysisSettingsByKind[K],
    events: EventFlags,
  ) => SpecResult;
  getDisplay: (settings: AnalysisSettingsByKind[K]) => CardDisplayType;
  getVizSettings: (
    settings: AnalysisSettingsByKind[K],
  ) => VisualizationSettings;
};
