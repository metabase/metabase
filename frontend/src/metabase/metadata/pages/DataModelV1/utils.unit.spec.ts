import type { ParsedRouteParams, RouteParams } from "./types";
import { getUrl, parseRouteParams } from "./utils";

describe("parseRouteParams", () => {
  it("should parse all route parameters correctly", () => {
    const params: RouteParams = {
      databaseId: "1",
      schemaId: "1:public",
      tableId: "2",
      fieldId: "3",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: 1,
      schemaName: "public",
      tableId: 2,
      fieldId: 3,
    });
  });

  it("should handle missing parameters", () => {
    const params: RouteParams = {
      databaseId: "1",
      schemaId: "1:public",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: 1,
      schemaName: "public",
      tableId: undefined,
      fieldId: undefined,
    });
  });

  it("should handle empty parameters", () => {
    const params: RouteParams = {
      databaseId: "",
      schemaId: "",
      tableId: "",
      fieldId: "",
    };

    expect(parseRouteParams(params)).toEqual({
      databaseId: undefined,
      schemaName: "",
      tableId: undefined,
      fieldId: undefined,
    });
  });
});

describe("getUrl", () => {
  it("should generate URL with all params", () => {
    const params: ParsedRouteParams = {
      databaseId: 1,
      schemaName: "public",
      tableId: 2,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe(
      "/admin/datamodel/database/1/schema/1:public/table/2/field/3",
    );
  });

  it("should generate URL with database, schema, and table", () => {
    const params: ParsedRouteParams = {
      databaseId: 1,
      schemaName: "public",
      tableId: 2,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe(
      "/admin/datamodel/database/1/schema/1:public/table/2",
    );
  });

  it("should generate URL with database and schema", () => {
    const params: ParsedRouteParams = {
      databaseId: 1,
      schemaName: "public",
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1/schema/1:public");
  });

  it("should generate URL with database", () => {
    const params: ParsedRouteParams = {
      databaseId: 1,
      schemaName: undefined,
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1");
  });

  it("should generate base URL when no params are provided", () => {
    const params: ParsedRouteParams = {
      databaseId: undefined,
      schemaName: undefined,
      tableId: undefined,
      fieldId: undefined,
    };

    expect(getUrl(params)).toBe("/admin/datamodel");
  });

  it("should not include field param when there is no table param", () => {
    const params: ParsedRouteParams = {
      databaseId: 1,
      schemaName: "public",
      tableId: undefined,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe("/admin/datamodel/database/1/schema/1:public");
  });

  it("should not include schema, table, and field params when there is no database param", () => {
    const params: ParsedRouteParams = {
      databaseId: undefined,
      schemaName: "public",
      tableId: 2,
      fieldId: 3,
    };

    expect(getUrl(params)).toBe("/admin/datamodel");
  });
});
