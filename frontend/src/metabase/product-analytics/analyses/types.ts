import type { CompleteSettingDefinitions } from "metabase/viz-core";
import type {
  CardDisplayType,
  DateTimeAbsoluteUnit,
  ProductAnalyticsKind,
  Table,
  VisualizationSettings,
} from "metabase-types/api";

/** What an analysis counts. */
export type Grain = "person" | "session" | "event";

/** The time unit an analysis buckets events by. */
export type Granularity = Extract<
  DateTimeAbsoluteUnit,
  "day" | "week" | "month"
>;

/** The facts analysis settings are computed from. Choices belong in settings. */
export type AnalysisContext = {
  /** The event table, with its event settings. */
  table: Table;
};

export type CommonSettings = {
  /** A date filter in the format dashboard date filters use, e.g. "past90days". */
  date_range: string;
  counting: Grain;
  granularity: Granularity;
};

/** What a kind of analysis can count and bucket by. The first of each is the default. */
export type CommonSettingsOptions = {
  grains: readonly [Grain, ...Grain[]];
  granularities: readonly [Granularity, ...Granularity[]];
};

/** What a habit chart's y-axis reports: raw people counts, or each slice's share of the total. */
export type HabitValues = "count" | "percent";

export type HabitSettings = CommonSettings & {
  habit_values: HabitValues;
};

export type AnalysisSettingsByKind = {
  habit: HabitSettings;
};

export type AnalysisSettingDefinitions<TSettings> = CompleteSettingDefinitions<
  AnalysisContext,
  TSettings
>;

export type AnalysisConfig<K extends ProductAnalyticsKind> = {
  options: CommonSettingsOptions;
  settings: AnalysisSettingDefinitions<AnalysisSettingsByKind[K]>;
  getTitle: (settings: AnalysisSettingsByKind[K]) => string;
  getDisplay: (settings: AnalysisSettingsByKind[K]) => CardDisplayType;
  getVizSettings: (
    settings: AnalysisSettingsByKind[K],
  ) => VisualizationSettings;
};
