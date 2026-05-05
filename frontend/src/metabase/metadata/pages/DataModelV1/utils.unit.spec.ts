import type { RouteParams } from "./types";
import { parseRouteParams } from "./utils";

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
