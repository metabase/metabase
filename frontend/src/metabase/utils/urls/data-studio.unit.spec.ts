import {
  dataStudio,
  dataStudioData,
  dataStudioDataModelSegment,
  dataStudioDataModelSegmentDependencies,
  dataStudioDataModelSegmentRevisions,
  dataStudioLibrary,
  dataStudioTable,
  dataStudioTableFields,
  dataStudioTableSegments,
  newDataStudioDataModelSegment,
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
