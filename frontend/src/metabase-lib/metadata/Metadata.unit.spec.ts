import { createMockMetadata } from "__support__/metadata";
import {
  createMockDatabase,
  createMockField,
  createMockMetric,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

describe("Metadata", () => {
  describe("instantiation", () => {
    it("should create an instance of Metadata", () => {
      const metadata = createMockMetadata({});
      expect(metadata).toBeDefined();
    });
  });

  describe("databasesList (deprecated)", () => {
    const metadata = createMockMetadata({
      databases: [
        createMockDatabase({
          id: 2,
          name: "A",
          is_saved_questions: true,
        }),
        createMockDatabase({
          id: 3,
          name: "B",
        }),
        createMockDatabase({
          id: 1,
          name: "C",
        }),
      ],
    });

    it("should return a sorted list of database objects found on the metadata instance", () => {
      const databases = metadata.databasesList();
      expect(databases).toEqual([
        metadata.database(2),
        metadata.database(3),
        metadata.database(1),
      ]);
    });

    it("should return all databases when the `savedQuestions` flag is true", () => {
      const databases = metadata.databasesList({ savedQuestions: true });
      expect(databases).toEqual([
        metadata.database(2),
        metadata.database(3),
        metadata.database(1),
      ]);
    });

    it("should exclude the 'is_saved_questions' db when the `savedQuestions` flag is false", () => {
      const databases = metadata.databasesList({ savedQuestions: false });
      expect(databases).toEqual([metadata.database(3), metadata.database(1)]);
    });
  });

  describe("tablesList (deprecated)", () => {
    it("should return a list of table objects found on the instance", () => {
      const metadata = createMockMetadata({
        tables: [createMockTable({ id: 1 }), createMockTable({ id: 2 })],
      });

      const tables = metadata.tablesList();
      expect(tables).toEqual([metadata.table(1), metadata.table(2)]);
    });
  });
  describe("metricsList (deprecated)", () => {
    it("should return a list of metric objects found on the instance", () => {
      const metadata = createMockMetadata({
        metrics: [createMockMetric({ id: 1 }), createMockMetric({ id: 2 })],
      });

      const metrics = metadata.metricsList();
      expect(metrics).toEqual([metadata.metric(1), metadata.metric(2)]);
    });
  });
  describe("segmentsList (deprecated)", () => {
    it("should return a list of segment objects found on the instance", () => {
      const metadata = createMockMetadata({
        segments: [createMockSegment({ id: 1 }), createMockSegment({ id: 2 })],
      });

      const segments = metadata.segmentsList();
      expect(segments).toEqual([metadata.segment(1), metadata.segment(2)]);
    });
  });

  describe("`field`", () => {
    it("should return null when given a nil fieldId arg", () => {
      const metadata = createMockMetadata({});
      expect(metadata.field(null)).toBeNull();
    });

    describe("when given a fieldId and no tableId", () => {
      it("should return null when there is no matching field", () => {
        const metadata = createMockMetadata({});
        expect(metadata.field(1)).toBeNull();
      });

      it("should return the matching Field instance", () => {
        const metadata = createMockMetadata({
          fields: [createMockField({ id: 1 })],
        });

        expect(metadata.field(1)).toBeDefined();
      });
    });

    describe("when given a fieldId and a concrete tableId", () => {
      it("should ignore the tableId arg because these fields are stored using the field's id", () => {
        const metadata = createMockMetadata({
          fields: [createMockField({ id: 1, table_id: 1 })],
        });

        const field = metadata.field(1);
        expect(field).toBeDefined();
        expect(metadata.field(1, 1)).toBe(field);
        // to prove the point that the `tableId` is ignored in this scenario
        expect(metadata.field(1, 2)).toBe(field);
      });
    });

    describe("when given a fieldId and a virtual card tableId", () => {
      it("should return the matching Field instance, stored using the field's `uniqueId`", () => {
        const metadata = createMockMetadata({
          fields: [createMockField({ id: 1, table_id: "card__123" })],
        });

        const field = metadata.field(1, "card__123");
        expect(field).toBeDefined();
        expect(metadata.field("card__123:1")).toBe(field);
        expect(metadata.field(1)).toBeNull();
      });
    });
  });
});
