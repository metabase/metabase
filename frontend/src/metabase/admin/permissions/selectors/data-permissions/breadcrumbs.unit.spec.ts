import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { getGroupsDataEditorBreadcrumbs } from "./breadcrumbs";

describe("admin > permissions > data > breadcrumbs", () => {
  describe("getGroupsDataEditorBreadcrumbs", () => {
    const multiSchemaDatabase = createMockDatabase({
      id: 100,
      name: "myDatabase",
      tables: [
        createMockTable({
          id: 300,
          db_id: 100,
          schema: "public",
          display_name: "myTable",
        }),
        createMockTable({
          id: 302,
          db_id: 100,
          schema: "myschema2",
          display_name: "myOtherTable",
        }),
      ],
    });

    const singleSchemaDatabase = createMockDatabase({
      id: 101,
      name: "mySchemalessDatabase",
      engine: "mysql",
      tables: [
        createMockTable({
          id: 301,
          db_id: 101,
          schema: "public",
          display_name: "mySchemalessTable",
        }),
      ],
    });

    it("should return breadcrumbs for a database with schema", () => {
      const breadcrumbs = getGroupsDataEditorBreadcrumbs(
        {
          databaseId: 100,
          schemaName: "public",
          tableId: 300,
        },
        multiSchemaDatabase,
      );

      expect(breadcrumbs).toEqual([
        {
          text: "myDatabase",
          id: 100,
          url: "/admin/permissions/data/database/100",
        },
        {
          text: "public",
          id: "100:public",
          url: "/admin/permissions/data/database/100/schema/public",
        },
        {
          text: "myTable",
          id: 300,
        },
      ]);
    });

    // from metabase's metadata perspective, there's no such thing as a schemaless database
    // even mysql has a single unnamed schema
    it("should return breadcrumbs for a database with only 1 schema", () => {
      const breadcrumbs = getGroupsDataEditorBreadcrumbs(
        {
          databaseId: 101,
          schemaName: "public",
          tableId: 301,
        },
        singleSchemaDatabase,
      );

      expect(breadcrumbs).toEqual([
        {
          text: "mySchemalessDatabase",
          id: 101,
          url: "/admin/permissions/data/database/101",
        },
        {
          text: "mySchemalessTable",
          id: 301,
        },
      ]);
    });
  });
});
