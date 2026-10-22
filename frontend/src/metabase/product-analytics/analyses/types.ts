import type {
  CardDisplayType,
  Table,
  VisualizationSettings,
} from "metabase-types/api";

import type { ColumnRole, ExtraColumn, UsersTableLink } from "../columns";
import type { EventDefinition, EventFlags } from "../events/types";
import type { AnalysisFilters } from "../filters";
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
import type { DrillPoint } from "../sql/compose";

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
  /** The table's pageviews, when its schema is one we recognize. */
  detectedPageviews?: EventDefinition;
};

export type ColumnRoleSettings = {
  [R in ColumnRole as `columns.${R}`]: string | null;
};

export type CommonSettings = ColumnRoleSettings & {
  /** Paths name these events by their page, not their event name. */
  pageviews: EventDefinition | null;
  counting: Grain;
  /** A serialized date filter, e.g. "past90days". See `date-range.ts`. */
  date_range: string;
  granularity: Granularity;
  filters: AnalysisFilters;
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
  "habit.measure": HabitSpec["measure"];
};

export type LifecycleSettings = CommonSettings & {
  "lifecycle.active": EventDefinition | null;
  "lifecycle.shown": LifecycleStateName[];
  "lifecycle.first_seen_column": string | null;
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

/** Colors picked in the display panel, by `ColorSlot` key. */
export type DisplayColors = Partial<Record<string, string>>;

/** A color the display panel offers a picker for. */
export type ColorSlot = {
  key: string;
  label: string;
  /** The picked color, or the chart's default. */
  color: string;
};

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
    colors: DisplayColors,
  ) => VisualizationSettings;
  /** The colors the display panel offers, in the order it shows them. */
  getColorSlots?: (
    settings: AnalysisSettingsByKind[K],
    colors: DisplayColors,
  ) => ColorSlot[];
  /**
   * Names the actors in a clicked point, e.g. "Reached step 2: Signed up".
   * `null`, or omitted, when the chart's clicks can't be traced to actors.
   */
  describePoint?: (
    settings: AnalysisSettingsByKind[K],
    point: DrillPoint,
  ) => string | null;
};
