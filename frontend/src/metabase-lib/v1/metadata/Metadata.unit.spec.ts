import { createMockMetadata } from "__support__/metadata";
import { createMockDatabase, createMockField } from "metabase-types/api/mocks";

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

  describe("`field`", () => {
    it("should return null when given a nil fieldId arg", () => {
      const metadata = createMockMetadata({});
      expect(metadata.field(null)).toBeNull();
    });

    describe("when given fieldId", () => {
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
  });
});
