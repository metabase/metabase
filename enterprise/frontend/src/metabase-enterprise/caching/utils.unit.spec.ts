import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import { hoursToSeconds, msToSeconds } from "metabase/lib/time";
import { checkNotNull } from "metabase/lib/types";
import type { CardType } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockSettings,
} from "metabase-types/api/mocks";

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
    avgQueryTime = null,
    databaseCacheTTL = null,
    cacheTTLMultiplier = DEFAULT_CACHE_TTL_MULTIPLIER,
    minCacheThreshold = 60,
  }: {
    avgQueryTime?: number | null;
    databaseCacheTTL?: number | null;
    cacheTTLMultiplier?: number;
    minCacheThreshold?: number;
  } = {}) {
    mockSettings({
      "query-caching-ttl-ratio": cacheTTLMultiplier,
      "query-caching-min-ttl": minCacheThreshold,
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
});

describe("hasQuestionCacheSection", () => {
  function setup({
    type = "question",
    canWrite = true,
    lastQueryStart = null,
  }: {
    type?: CardType;
    canWrite?: boolean;
    lastQueryStart?: string | null;
  }) {
    const card = createMockCard({
      type,
      can_write: canWrite,
      last_query_start: lastQueryStart,
    });
    const settings = createMockSettings();
    const metadata = createMockMetadata({ questions: [card] }, settings);
    return checkNotNull(metadata.question(card.id));
  }

  it("should not have the cache section for models", () => {
    const question = setup({ type: "model" });
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
