import type { Config as CacheConfig } from "metabase/admin/performance/types";

export const createMockCacheConfig = (
  opts?: Partial<CacheConfig>,
): CacheConfig => ({
  model: "database",
  model_id: 1,
  strategy: { type: "ttl", multiplier: 1, min_duration: 1 },
  ...opts,
});

export const createMockCacheConfigWithTTLStrategy = (
  opts?: Partial<CacheConfig>,
): CacheConfig =>
  createMockCacheConfig({
    strategy: { type: "ttl", multiplier: 1, min_duration: 1 },
    ...opts,
  });

export const createMockCacheConfigWithDoNotCacheStrategy = (
  opts?: Partial<CacheConfig>,
): CacheConfig =>
  createMockCacheConfig({ strategy: { type: "nocache" }, ...opts });

export const createMockCacheConfigWithDurationStrategy = (
  opts?: Partial<CacheConfig>,
): CacheConfig =>
  createMockCacheConfig({
    strategy: { type: "duration", duration: 1, unit: "hours" },
    ...opts,
  });
