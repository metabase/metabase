import { checkNotNull } from "metabase/core/utils/types";
import { msToSeconds, hoursToSeconds } from "metabase/lib/time";
import {
  createMockCard,
  createMockDatabase,
  createMockSettings,
} from "metabase-types/api/mocks";
import { mockSettings } from "__support__/settings";
import { createMockMetadata } from "__support__/metadata";
import {
  getQuestionsImplicitCacheTTL,
  hasQuestionCacheSection,
  validateCacheTTL,
} from "./utils";

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
  }: {
    cachingEnabled?: boolean;
    avgQueryTime?: number | null;
    databaseCacheTTL?: number | null;
    cacheTTLMultiplier?: number;
    minCacheThreshold?: number;
  } = {}) {
    mockSettings({
      "enable-query-caching": cachingEnabled,
      "query-caching-ttl-ratio": cachingEnabled ? cacheTTLMultiplier : 10,
      "query-caching-min-ttl": cachingEnabled ? minCacheThreshold : 60,
    });

    const card = createMockCard({
      average_query_time: avgQueryTime,
    });
    const database = createMockDatabase({
      cache_ttl: databaseCacheTTL,
    });

    const metadata = createMockMetadata({
      questions: [card],
      databases: [database],
    });

    return checkNotNull(metadata.question(card.id));
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

describe("hasQuestionCacheSection", () => {
  function setup({
    isDataset = false,
    isCachingEnabled = true,
    canWrite = true,
    lastQueryStart = null,
  }: {
    isDataset?: boolean;
    isCachingEnabled?: boolean;
    canWrite?: boolean;
    lastQueryStart?: string | null;
  }) {
    const card = createMockCard({
      dataset: isDataset,
      can_write: canWrite,
      last_query_start: lastQueryStart,
    });
    const settings = createMockSettings({
      "enable-query-caching": isCachingEnabled,
    });
    const metadata = createMockMetadata({ questions: [card] }, settings);
    return checkNotNull(metadata.question(card.id));
  }

  it("should not have the cache section for models", () => {
    const question = setup({ isDataset: true });
    expect(hasQuestionCacheSection(question)).toBe(false);
  });

  it("should not have the cache section when caching is disabled", () => {
    const question = setup({ isCachingEnabled: false });
    expect(hasQuestionCacheSection(question)).toBe(false);
  });

  it("should not have the cache section when the user has no write access and the question is not cached", () => {
    const question = setup({ canWrite: false, lastQueryStart: null });
    expect(hasQuestionCacheSection(question)).toBe(false);
  });

  it("should have the cache section when the user has no write access but the question is cached", () => {
    const question = setup({ canWrite: false, lastQueryStart: "2020-01-01" });
    expect(hasQuestionCacheSection(question)).toBe(true);
  });

  it("should have the cache section when the user has write access but the question is not cached", () => {
    const question = setup({ canWrite: true, lastQueryStart: null });
    expect(hasQuestionCacheSection(question)).toBe(true);
  });

  it("should have the cache section when the user has write access and the question is cached", () => {
    const question = setup({ canWrite: true, lastQueryStart: "2020-01-01" });
    expect(hasQuestionCacheSection(question)).toBe(true);
  });
});
