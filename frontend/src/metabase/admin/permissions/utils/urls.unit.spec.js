import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "./urls";

describe("getDatabaseFocusPermissionsUrl", () => {
  it("when entityId is not specified it returns base editor url", () => {
    const url = getDatabaseFocusPermissionsUrl();
    expect(url).toEqual("/admin/permissions/data/database");
  });

  it("when entityId is a database id it returns database permissions url", () => {
    const url = getDatabaseFocusPermissionsUrl({ databaseId: 1 });
    expect(url).toEqual("/admin/permissions/data/database/1");
  });

  it("when entityId is a schema id it returns database permissions url", () => {
    const url = getDatabaseFocusPermissionsUrl({
      databaseId: 1,
      schemaName: "my_schema",
    });
    expect(url).toEqual("/admin/permissions/data/database/1/schema/my_schema");
  });

  it("when entityId is a sub-schema id it returns database permissions url", () => {
    const url = getDatabaseFocusPermissionsUrl({
      databaseId: 1,
      schemaName: "my_schemas/schema",
    });
    expect(url).toEqual(
      "/admin/permissions/data/database/1/schema/my_schemas%2Fschema",
    );
  });

  it("when entityId is a table id with schema it returns table permissions url", () => {
    const url = getDatabaseFocusPermissionsUrl({
      databaseId: 1,
      schemaName: "my_schema",
      tableId: 10,
    });
    expect(url).toEqual(
      "/admin/permissions/data/database/1/schema/my_schema/table/10",
    );
  });

  it("when entityId is a table id without schema it returns table permissions url", () => {
    const url = getDatabaseFocusPermissionsUrl({
      databaseId: 1,
      tableId: 10,
    });
    expect(url).toEqual("/admin/permissions/data/database/1/table/10");
  });
});

describe("getGroupFocusPermissionsUrl", () => {
  it("when groupId is not specified it returns base editor url", () => {
    const url = getGroupFocusPermissionsUrl();
    expect(url).toEqual("/admin/permissions/data/group");
  });

  it("when entityId is a database id it returns database permissions url", () => {
    const url = getGroupFocusPermissionsUrl(1, { databaseId: 1 });
    expect(url).toEqual("/admin/permissions/data/group/1/database/1");
  });

  it("when entityId is a schema id it returns database permissions url", () => {
    const url = getGroupFocusPermissionsUrl(1, {
      databaseId: 1,
      schemaName: "my_schema",
    });
    expect(url).toEqual(
      "/admin/permissions/data/group/1/database/1/schema/my_schema",
    );
  });

  it("encodes schema names with slashes", () => {
    const url = getGroupFocusPermissionsUrl(1, {
      databaseId: 1,
      schemaName: "my_schemas/schema",
    });
    expect(url).toEqual(
      "/admin/permissions/data/group/1/database/1/schema/my_schemas%2Fschema",
    );
  });
});
