import { getUrl, parseRouteParams } from "./route-params";

describe("parseRouteParams", () => {
  it("should parse all route parameters correctly", () => {
    const params = {
      databaseId: "1",
      schemaId: "public",
      tableId: "2",
      fieldId: "3",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: 1,
      schemaId: "public",
      tableId: 2,
      fieldId: 3,
    });
  });

  it("should handle missing parameters", () => {
    const params = {
      databaseId: "1",
      schemaId: "public",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: 1,
      schemaId: "public",
      tableId: undefined,
      fieldId: undefined,
    });
  });

  it("should handle empty parameters", () => {
    const params = {
      databaseId: "",
      schemaId: "",
      tableId: "",
      fieldId: "",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: undefined,
      schemaId: "",
      tableId: undefined,
      fieldId: undefined,
    });
  });
});

describe("getUrl", () => {
  it("should generate URL with all params", () => {
    const params = {
      databaseId: 1,
      schemaId: "public",
      tableId: 2,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe(
      "/admin/datamodel/database/1/schema/public/table/2/field/3",
    );
  });

  it("should generate URL with database, schema, and table", () => {
    const params = {
      databaseId: 1,
      schemaId: "public",
      tableId: 2,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe(
      "/admin/datamodel/database/1/schema/public/table/2",
    );
  });

  it("should generate URL with database and schema", () => {
    const params = {
      databaseId: 1,
      schemaId: "public",
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1/schema/public");
  });

  it("should generate URL with database", () => {
    const params = {
      databaseId: 1,
      schemaId: undefined,
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1");
  });

  it("should generate base URL when no params are provided", () => {
    const params = {
      databaseId: undefined,
      schemaId: undefined,
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel");
  });

  it("should not include field param when there is no table param", () => {
    const params = {
      databaseId: 1,
      schemaId: "public",
      tableId: undefined,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1/schema/public");
  });

  it("should not include schema, table, and field params when there is no database param", () => {
    const params = {
      databaseId: undefined,
      schemaId: "public",
      tableId: 2,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe("/admin/datamodel");
  });
});
