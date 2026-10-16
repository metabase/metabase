import type {
  CardDisplayType,
  Table,
  VisualizationSettings,
} from "metabase-types/api";

import type { ColumnRole, ExtraColumn, UsersTableLink } from "../columns";
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

import type { BreakdownColumn } from "./breakdown";

/** The table the person column links to, with its metadata loaded. */
export type UsersTable = {
  link: UsersTableLink;
  table: Table;
};

/** Facts the settings are computed from. Choices belong in settings. */
export type AnalysisContext = {
  table: Table | undefined;
  /** Undefined until the event table and the users table are both loaded. */
  usersTable: UsersTable | undefined;
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
  /** Only applies to the step-by-step view. */
  "funnel.breakdown": BreakdownColumn[];
  /** The transition the breakdown is for: step k → step k+1, numbered from 1. */
  "funnel.breakdown_step": number;
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
  "cohorts.by": CohortsSpec["by"];
  /** An event table column; the earliest value per actor starts their clock. */
  "cohorts.start_column": string | null;
  /** A users table column when there is a users table, else an event table column. */
  "cohorts.attribute": string | null;
  "cohorts.return": EventDefinition | null;
  "cohorts.return_rule": CohortsSpec["returnRule"];
  /** How many periods after their start to follow each cohort: the columns. */
  "cohorts.horizon": number;
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
  /** Table columns the planner reads beyond the roles. */
  getExtraColumns?: (
    settings: AnalysisSettingsByKind[K],
    context: AnalysisContext,
  ) => ExtraColumn[];
  getDisplay: (settings: AnalysisSettingsByKind[K]) => CardDisplayType;
  getVizSettings: (
    settings: AnalysisSettingsByKind[K],
    context: AnalysisContext,
  ) => VisualizationSettings;
};
