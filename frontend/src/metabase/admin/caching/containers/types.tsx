export type CacheStrategy =
  | "nocache"
  | "ttl"
  | "duration"
  | "schedule"
  | "query";
export type UnitOfTime = "hours" | "minutes" | "seconds" | "days";
export type CacheableModelType =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

// TODO: I'm guessing this from caching/strategies.clj
export type CacheConfig = {
  modelType: CacheableModelType; // "model type" rather than "model" makes more sense in my head so I'm using that for now
  model_id: number;
  strategy: CacheStrategy;
  config: {
    type?: string;
    updated_at?: string;
    multiplier?: number;
    payload?: string;
    min_duration?: number;
    unit?: UnitOfTime;
    schedule?: string;
    field_id?: string;
    aggregation?: string;
  };
};
