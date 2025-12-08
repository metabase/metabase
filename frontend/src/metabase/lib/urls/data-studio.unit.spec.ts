import {
  dataStudio,
  dataStudioData,
  dataStudioModeling,
  dataStudioSegment,
  dataStudioTable,
  dataStudioTableFields,
  dataStudioTableSegments,
  newDataStudioSegment,
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

  describe("dataStudioModeling", () => {
    it("should return modeling URL", () => {
      expect(dataStudioModeling()).toBe("/data-studio/modeling");
    });
  });

  describe("dataStudioTable", () => {
    it("should return table URL", () => {
      expect(dataStudioTable(42)).toBe("/data-studio/modeling/tables/42");
    });
  });

  describe("dataStudioTableFields", () => {
    it("should return table fields URL without fieldId", () => {
      expect(dataStudioTableFields(42)).toBe(
        "/data-studio/modeling/tables/42/fields",
      );
    });

    it("should return table fields URL with fieldId", () => {
      expect(dataStudioTableFields(42, 100)).toBe(
        "/data-studio/modeling/tables/42/fields/100",
      );
    });
  });

  describe("dataStudioTableSegments", () => {
    it("should return table segments URL", () => {
      expect(dataStudioTableSegments(42)).toBe(
        "/data-studio/modeling/tables/42/segments",
      );
    });
  });

  describe("dataStudioSegment", () => {
    it("should return segment edit URL", () => {
      expect(dataStudioSegment(123)).toBe("/data-studio/modeling/segments/123");
    });
  });

  describe("newDataStudioSegment", () => {
    it("should return new segment URL with tableId", () => {
      expect(newDataStudioSegment(42)).toBe(
        "/data-studio/modeling/segments/new?tableId=42",
      );
    });
  });
});
