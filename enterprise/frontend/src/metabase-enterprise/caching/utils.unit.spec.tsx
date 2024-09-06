import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { CardType } from "metabase-types/api";
import { createMockCard, createMockSettings } from "metabase-types/api/mocks";

import { hasQuestionCacheSection } from "./utils";

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

  it("should have the cache section for metrics", () => {
    const question = setup({ type: "metric" });
    expect(hasQuestionCacheSection(question)).toBe(true);
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
