import { createMockMetadata } from "__support__/metadata";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [createMockMetric({ id: 1 })],
});

const db = metadata.database(SAMPLE_DB_ID);

describe("StructuredQuery", () => {
  describe("cleanNesting", () => {
    it("should not modify empty queries with no source-query", () => {
      expect(
        db
          .question()
          .legacyQuery({ useStructuredQuery: true })
          .cleanNesting()
          .datasetQuery(),
      ).toEqual({
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": undefined },
      });
    });
  });
});
