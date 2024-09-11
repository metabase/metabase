import type { CacheStrategy, CacheableModel } from "metabase-types/api";

export type CacheTestParameters = {
  description: string;
  strategy: CacheStrategy;
  /** Item whose cache we are testing */
  item: StrategyBearer;
  inheritsStrategyFrom?: StrategyBearer;
  /** Function that runs the test. Set to it, it.only, or it.skip */
  it?: Mocha.TestFunction;
  /** Whether the test is being run in OSS */
  oss?: boolean;
};

/** Something with a configurable cache strategy */
export type StrategyBearer = {
  model: CacheableModel;
  name: string;
};

export type SelectCacheStrategyOptions<Strategy = CacheStrategy> = {
  /** The item to be configured */
  item: StrategyBearer;
  strategy: Strategy;
  /** Whether the test is being run in OSS */
  oss?: boolean;
};

export type DashboardDetails = {
  name: string;
};
