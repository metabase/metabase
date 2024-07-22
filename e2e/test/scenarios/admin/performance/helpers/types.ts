import type {
  CacheStrategy,
  CacheableModel,
  ScheduleStrategy,
} from "metabase-types/api";

export type CacheTestParameters = {
  description: string;
  strategy: CacheStrategy;
  /** Item whose cache we are testing */
  item: StrategyBearer;
  inheritsStrategyFrom?: StrategyBearer;
  /** Function that runs the test. Set to it, it.only, or it.skip */
  it?: () => void;
};

/** Something with a configurable cache strategy */
export type StrategyBearer = {
  model: CacheableModel;
  name: string;
};

// When specifying a strategy to select, if it's a schedule strategy,
// do not specify the schedule i.e. the cron expression.
// The specific schedule must be selected by clicking on the <select> components.
type SelectableCacheStrategy =
  | Exclude<CacheStrategy, ScheduleStrategy>
  | Omit<ScheduleStrategy, "schedule">;

export type SelectCacheStrategyOptions<Strategy = SelectableCacheStrategy> = {
  /** The item to be configured */
  item: StrategyBearer;
  strategy: Strategy;
  shouldSaveChanges?: boolean;
  shouldWrapResult?: boolean;
};

export type DashboardDetails = {
  name: string;
};
