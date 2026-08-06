import {
  dataStudio,
  dataStudioArchivedSnippets,
  dataStudioData,
  dataStudioDataModelSegment,
  dataStudioDataModelSegmentDependencies,
  dataStudioDataModelSegmentRevisions,
  dataStudioLibrary,
  dataStudioMetric,
  dataStudioPublishedTableMeasure,
  dataStudioPublishedTableSegment,
  dataStudioSnippet,
  dataStudioTable,
  dataStudioTableFields,
  dataStudioTableSegments,
  newDataStudioDataModelSegment,
  newDataStudioMetric,
  newDataStudioSnippet,
} from "./data-studio";

describe("urls > data-studio", () => {
  describe("dataStudio", () => {
    it("should return root URL", () => {
      expect(dataStudio()).toBe("/data-studio");
    });
  });

  describe("dataStudioData", () => {
    it("should return base data URL when no params", () => {
      expect(dataStudioData()).toBe("/data-studio/data");
    });

    it("should include database", () => {
      expect(dataStudioData({ databaseId: 1 })).toBe(
        "/data-studio/data/database/1",
      );
    });

    it("should include database and schema", () => {
      expect(dataStudioData({ databaseId: 1, schemaName: "public" })).toBe(
        "/data-studio/data/database/1/schema/1:public",
      );
    });

    it("should encode schema name with special characters", () => {
      expect(
        dataStudioData({ databaseId: 1, schemaName: "My Schema/Test" }),
      ).toBe("/data-studio/data/database/1/schema/1:My%20Schema%2FTest");
    });

    it("should include table", () => {
      expect(
        dataStudioData({ databaseId: 1, schemaName: "public", tableId: 42 }),
      ).toBe("/data-studio/data/database/1/schema/1:public/table/42");
    });

    it("should generate URL with field tab", () => {
      expect(
        dataStudioData({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          tab: "field",
        }),
      ).toBe("/data-studio/data/database/1/schema/1:public/table/42/field");
    });

    it("should generate URL with segments tab", () => {
      expect(
        dataStudioData({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          tab: "segments",
        }),
      ).toBe("/data-studio/data/database/1/schema/1:public/table/42/segments");
    });

    it("should generate URL with field tab and fieldId", () => {
      expect(
        dataStudioData({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          tab: "field",
          fieldId: 100,
        }),
      ).toBe("/data-studio/data/database/1/schema/1:public/table/42/field/100");
    });

    it("should not include fieldId when tab is segments", () => {
      expect(
        dataStudioData({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          tab: "segments",
          fieldId: 100,
        }),
      ).toBe("/data-studio/data/database/1/schema/1:public/table/42/segments");
    });
  });

  describe("dataStudioLibrary", () => {
    it("should return library URL", () => {
      expect(dataStudioLibrary()).toBe("/data-studio/library");
    });

    it("should return worktree library URL", () => {
      expect(dataStudioLibrary({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library",
      );
    });

    it("should keep expandedIds in worktree scope", () => {
      expect(dataStudioLibrary({ worktreeId: 7, expandedIds: [1, 2] })).toBe(
        "/data-studio/worktrees/7/library?expandedId=1&expandedId=2",
      );
    });
  });

  describe("worktree-scoped library URLs", () => {
    it("should build worktree table URLs", () => {
      expect(dataStudioTable(42, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/tables/42",
      );
      expect(dataStudioTableFields(42, 100, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/tables/42/fields/100",
      );
      expect(dataStudioPublishedTableSegment(42, 123, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/tables/42/segments/123",
      );
      expect(dataStudioPublishedTableMeasure(42, 123, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/tables/42/measures/123",
      );
    });

    it("should build worktree metric URLs", () => {
      expect(dataStudioMetric(5, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/metrics/5",
      );
      expect(newDataStudioMetric({ worktreeId: 7, collectionId: 3 })).toBe(
        "/data-studio/worktrees/7/library/metrics/new?collectionId=3",
      );
    });

    it("should build worktree snippet URLs", () => {
      expect(dataStudioSnippet(9, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/snippets/9",
      );
      expect(newDataStudioSnippet({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/snippets/new",
      );
      expect(dataStudioArchivedSnippets({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/library/snippets/archived",
      );
    });

    it("should fall back to the main library when worktreeId is null", () => {
      expect(dataStudioTable(42, { worktreeId: null })).toBe(
        "/data-studio/library/tables/42",
      );
    });
  });

  describe("dataStudioTable", () => {
    it("should return table URL", () => {
      expect(dataStudioTable(42)).toBe("/data-studio/library/tables/42");
    });
  });

  describe("dataStudioTableFields", () => {
    it("should return table fields URL without fieldId", () => {
      expect(dataStudioTableFields(42)).toBe(
        "/data-studio/library/tables/42/fields",
      );
    });

    it("should return table fields URL with fieldId", () => {
      expect(dataStudioTableFields(42, 100)).toBe(
        "/data-studio/library/tables/42/fields/100",
      );
    });
  });

  describe("dataStudioTableSegments", () => {
    it("should return table segments URL", () => {
      expect(dataStudioTableSegments(42)).toBe(
        "/data-studio/library/tables/42/segments",
      );
    });
  });

  describe("dataStudioDataModelSegment", () => {
    const params = {
      databaseId: 1,
      schemaName: "public",
      tableId: 42,
      segmentId: 123,
    };

    it("should return data model segment URL", () => {
      expect(dataStudioDataModelSegment(params)).toBe(
        "/data-studio/data/database/1/schema/1:public/table/42/segments/123",
      );
    });

    it("should encode schema name with special characters", () => {
      expect(
        dataStudioDataModelSegment({
          ...params,
          schemaName: "My Schema/Test",
        }),
      ).toBe(
        "/data-studio/data/database/1/schema/1:My%20Schema%2FTest/table/42/segments/123",
      );
    });
  });

  describe("dataStudioDataModelSegmentRevisions", () => {
    it("should return data model segment revisions URL", () => {
      expect(
        dataStudioDataModelSegmentRevisions({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          segmentId: 123,
        }),
      ).toBe(
        "/data-studio/data/database/1/schema/1:public/table/42/segments/123/revisions",
      );
    });
  });

  describe("dataStudioDataModelSegmentDependencies", () => {
    it("should return data model segment dependencies URL", () => {
      expect(
        dataStudioDataModelSegmentDependencies({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
          segmentId: 123,
        }),
      ).toBe(
        "/data-studio/data/database/1/schema/1:public/table/42/segments/123/dependencies",
      );
    });
  });

  describe("newDataStudioDataModelSegment", () => {
    it("should return new data model segment URL", () => {
      expect(
        newDataStudioDataModelSegment({
          databaseId: 1,
          schemaName: "public",
          tableId: 42,
        }),
      ).toBe(
        "/data-studio/data/database/1/schema/1:public/table/42/segments/new",
      );
    });
  });
});
