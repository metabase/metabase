import { mockSettings } from "__support__/settings";
import { msToSeconds, hoursToSeconds } from "metabase/lib/time";
import { getQuestionsImplicitCacheTTL, validateCacheTTL } from "./utils";

describe("validateCacheTTL", () => {
  const validTestCases = [null, 0, 1, 6, 42];
  const invalidTestCases = [-1, -1.2, 0.5, 4.3];

  validTestCases.forEach(value => {
    it(`should be valid for ${value}`, () => {
      expect(validateCacheTTL(value)).toBe(undefined);
    });
  });

  invalidTestCases.forEach(value => {
    it(`should return error for ${value}`, () => {
      expect(validateCacheTTL(value)).toBe("Must be a positive integer value");
    });
  });
});

describe("getQuestionsImplicitCacheTTL", () => {
  const TEN_MINUTES = 10 * 60 * 1000;
  const DEFAULT_CACHE_TTL_MULTIPLIER = 10;

  function setup({
    cachingEnabled = true,
    avgQueryTime = null,
    databaseCacheTTL = null,
    cacheTTLMultiplier = DEFAULT_CACHE_TTL_MULTIPLIER,
    minCacheThreshold = 60,
  } = {}) {
    mockSettings({
      "enable-query-caching": cachingEnabled,
      "query-caching-ttl-ratio": cachingEnabled ? cacheTTLMultiplier : null,
      "query-caching-min-ttl": cachingEnabled ? minCacheThreshold : null,
    });

    return {
      card: () => ({
        average_query_time: avgQueryTime,
      }),
      database: () => ({
        cache_ttl: databaseCacheTTL,
      }),
    };
  }

  it("returns database's cache TTL if set", () => {
    const question = setup({ databaseCacheTTL: 10 });
    expect(getQuestionsImplicitCacheTTL(question)).toBe(hoursToSeconds(10));
  });

  it("returns 'magic TTL' if there is no prior caching strategy", () => {
    const question = setup({ avgQueryTime: TEN_MINUTES });

    expect(getQuestionsImplicitCacheTTL(question)).toBe(
      msToSeconds(TEN_MINUTES * DEFAULT_CACHE_TTL_MULTIPLIER),
    );
  });

  it("returns null if instance-level caching enabled, but the query doesn't pass the min exec time threshold", () => {
    const question = setup({
      avgQueryTime: TEN_MINUTES,
      minCacheThreshold: TEN_MINUTES * 2,
    });
    expect(getQuestionsImplicitCacheTTL(question)).toBe(null);
  });

  it("prefers database cache TTL over instance-level one", () => {
    const question = setup({ databaseCacheTTL: 10, avgQueryTime: TEN_MINUTES });
    expect(getQuestionsImplicitCacheTTL(question)).toBe(hoursToSeconds(10));
  });

  it("returns null if caching disabled, but instance level caching parameters are present", () => {
    const question = setup({
      avgQueryTime: TEN_MINUTES,
      cachingEnabled: false,
    });
    expect(getQuestionsImplicitCacheTTL(question)).toBe(null);
  });

  it("returns null if caching disabled, but database has a cache ttl", () => {
    const question = setup({ databaseCacheTTL: 10, cachingEnabled: false });
    expect(getQuestionsImplicitCacheTTL(question)).toBe(null);
  });
});
