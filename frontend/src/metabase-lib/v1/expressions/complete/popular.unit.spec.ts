import { createMockMetadata } from "__support__/metadata";
import { createQuery } from "metabase-lib/test-helpers";
import {
  POPULAR_AGGREGATIONS,
  POPULAR_FILTERS,
  POPULAR_FUNCTIONS,
} from "metabase-lib/v1/expressions";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { type Options, suggestPopular } from "./popular";

describe("suggestPopular", () => {
  function setup({ startRule = "expression" }: Partial<Options> = {}) {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
    });
    const query = createQuery({ metadata });
    const source = suggestPopular({
      startRule,
      query,
      metadata,
      reportTimezone: "America/New_York",
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  describe("startRule = expression", () => {
    const startRule = "expression";

    it("should suggest popular functions when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_FUNCTIONS.length);
    });

    it("should not suggest popular functions when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = boolean", () => {
    const startRule = "boolean";

    it("should suggest popular filters when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_FILTERS.length);
    });

    it("should not suggest popular filters when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });

  describe("startRule = aggregation", () => {
    const startRule = "aggregation";

    it("should suggest popular aggregations when the doc is empty", async () => {
      const complete = setup({ startRule });
      const results = await complete("|");
      expect(results).toEqual({
        from: 0,
        options: expect.any(Array),
      });
      expect(results?.options).toHaveLength(POPULAR_AGGREGATIONS.length);
    });

    it("should not suggest popular aggregations when the doc is not empty", () => {
      const complete = setup({ startRule });
      const results = complete("hello|");
      expect(results).toEqual(null);
    });
  });
});
