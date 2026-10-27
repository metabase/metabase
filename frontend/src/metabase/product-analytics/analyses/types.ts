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
  PathsVisit,
} from "../spec/types";
import type { DrillPoint } from "../sql/compose";

import type { Breakout, BreakoutView } from "./breakout";
import type { FunnelDisqualifier } from "./funnel-disqualifiers";

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
  /**
   * Colors picked in the display panel, so setup widgets can show the same
   * colors as the chart. Not settings: they don't change the query.
   */
  displayColors?: DisplayColors;
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
  /** Null: no breakout. Only analyses that opt in read it. */
  breakout: Breakout | null;
  /** Broken out, a chart or a pivot table. Only analyses that opt in read it. */
  breakout_view: BreakoutView;
  filters: AnalysisFilters;
};

export type FunnelSettings = CommonSettings & {
  "funnel.steps": EventDefinition[];
  "funnel.view": NonNullable<OutputSpec["funnelView"]>;
  "funnel.window": Duration;
  "funnel.ordering": FunnelSpec["ordering"];
  "funnel.disqualifiers": FunnelDisqualifier[];
};

export type PathsSettings = CommonSettings & {
  "paths.direction": PathsSpec["direction"];
  "paths.start": EventDefinition | null;
  "paths.end": EventDefinition | null;
  "paths.steps": number;
  "paths.included": EventDefinition[];
  "paths.visit": PathsVisit["kind"];
  /** How long a break ends a visit, when visits aren't sessions. */
  "paths.inactivity": Duration;
  "paths.merge_repeats": boolean;
  "paths.hide_noisy_events": boolean;
  "paths.max_nodes": number;
  "paths.min_volume": number;
};

/** Whether a chart shows counts or each count's share of a total. */
export type ValuesDisplay = "counts" | "percent";

export type HabitSettings = CommonSettings & {
  "habit.active": EventDefinition | null;
  "habit.measure": HabitSpec["measure"];
  /** The histogram's people as counts, or as a share of their group. */
  "habit.values": ValuesDisplay;
};

export type LifecycleSettings = CommonSettings & {
  "lifecycle.active": EventDefinition | null;
  "lifecycle.shown": LifecycleStateName[];
  "lifecycle.first_seen_column": string | null;
};

export type CohortsSettings = CommonSettings & {
  /** The first time an actor does it in the date range starts their clock. Null: any event. */
  "cohorts.start": EventDefinition | null;
  "cohorts.return": EventDefinition | null;
  "cohorts.return_rule": CohortsSpec["returnRule"];
  /** A table with a row per cohort, or retention curves on a line chart. */
  "cohorts.view": "table" | "curves";
  "cohorts.display": NonNullable<OutputSpec["cohortsDisplay"]>;
  "cohorts.lines": NonNullable<OutputSpec["cohortsLines"]>;
  /** The line chart's x-axis: periods since each cohort started, or the calendar. */
  "cohorts.x_axis": "sinceStart" | "date";
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
  /** The chart's title when it depends on the settings, in place of `question`. */
  getQuestion?: (settings: AnalysisSettingsByKind[K]) => string;
  /**
   * More changes that follow from a user's change, applied with it. Setting
   * widgets only write their own key; this keeps related ones in step.
   */
  getFollowingChanges?: (
    changes: Partial<AnalysisSettingsByKind[K]>,
    settings: AnalysisSettingsByKind[K],
  ) => Partial<AnalysisSettingsByKind[K]>;
  /**
   * Names the actors in a clicked point, e.g. "Reached step 2: Signed up".
   * `null`, or omitted, when the chart's clicks can't be traced to actors.
   */
  describePoint?: (
    settings: AnalysisSettingsByKind[K],
    point: DrillPoint,
  ) => string | null;
};
