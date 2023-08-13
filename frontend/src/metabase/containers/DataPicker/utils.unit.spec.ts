import { getDataTypes } from "metabase/containers/DataPicker";

describe("DataPicker > utils", () => {
  describe("when nested queries are enabled", () => {
    it("should return all non empty buckets - models & saved questions", () => {
      const result = getDataTypes({
        hasModels: true,
        hasSavedQuestions: true,
        hasNestedQueriesEnabled: true,
      });

      expect(result).toMatchObject([
        { name: "Models" },
        { name: "Raw Data" },
        { name: "Saved Questions" },
      ]);
    });

    it("should return all non empty buckets - saved questions", () => {
      const result = getDataTypes({
        hasModels: false,
        hasSavedQuestions: true,
        hasNestedQueriesEnabled: true,
      });

      expect(result).toMatchObject([
        { name: "Raw Data" },
        { name: "Saved Questions" },
      ]);
    });

    it("should return all non empty buckets - models", () => {
      const result = getDataTypes({
        hasModels: true,
        hasSavedQuestions: false,
        hasNestedQueriesEnabled: true,
      });

      expect(result).toMatchObject([{ name: "Models" }, { name: "Raw Data" }]);
    });
  });

  describe("when nested queries are disabled", () => {
    it("should not return models nor saved questions", () => {
      const result = getDataTypes({
        hasModels: true,
        hasSavedQuestions: true,
        hasNestedQueriesEnabled: false,
      });

      expect(result).toMatchObject([{ name: "Raw Data" }]);
    });
  });
});
