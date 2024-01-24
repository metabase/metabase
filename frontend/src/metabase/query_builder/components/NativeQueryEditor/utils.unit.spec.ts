import {
  canFormatForEngine,
  formatQuery,
} from "metabase/query_builder/components/NativeQueryEditor/utils";

describe("utils", () => {
  describe("canFormatForEngine", () => {
    it("should return true for SQL engines", () => {
      expect(canFormatForEngine("postgres")).toBe(true);
      expect(canFormatForEngine("mysql")).toBe(true);
      expect(canFormatForEngine("snowflake")).toBe(true);
      expect(canFormatForEngine("redshift")).toBe(true);
      expect(canFormatForEngine("bigquery")).toBe(true);
      expect(canFormatForEngine("oracle")).toBe(true);
      expect(canFormatForEngine("snowflake")).toBe(true);
      expect(canFormatForEngine("sparksql")).toBe(true);
      expect(canFormatForEngine("sqlite")).toBe(true);
      expect(canFormatForEngine("sqlserver")).toBe(true);
      expect(canFormatForEngine("vertica")).toBe(true);
    });

    it("should return false for non-SQL engines", () => {
      expect(canFormatForEngine("mongo")).toBe(false);
      expect(canFormatForEngine("googleanalytics")).toBe(false);
      expect(canFormatForEngine("druid")).toBe(false);
    });
  });

  describe("formatQuery", () => {
    it("should format SQL queries", async () => {
      expect(await formatQuery("SeLeCt \n\n\n\n\n * fRoM foo", "postgres"))
        .toBe(`SELECT
  *
FROM
  foo`);
    });

    it("should format queries with parameters and nested queries syntax", async () => {
      expect(
        await formatQuery(
          "select * from {{#1-orders}} where {{idFilter}} and category={{categoryFilter}}",
          "postgres",
        ),
      ).toBe(`SELECT
  *
FROM
  {{#1-orders}}
WHERE
  {{idFilter}}
  AND category = {{categoryFilter}}`);
    });
  });
});
