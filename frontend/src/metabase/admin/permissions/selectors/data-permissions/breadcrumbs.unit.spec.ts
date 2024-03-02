import { createMockMetadata } from "__support__/metadata";
import {
  createMockDatabase,
  createMockSchema,
  createMockTable,
} from "metabase-types/api/mocks";

import { getGroupsDataEditorBreadcrumbs } from "./breadcrumbs";

describe("admin > permissions > data > breadcrumbs", () => {
  describe("getGroupsDataEditorBreadcrumbs", () => {
    const schema = createMockSchema({
      id: "100:myschema",
      name: "myschema",
    });

    const schema2 = createMockSchema({
      id: "100:myschema2",
      name: "myschema2",
    });

    const metadata = createMockMetadata({
      databases: [
        createMockDatabase({
          id: 100,
          name: "myDatabase",
          // @ts-expect-error - we have to set this manually for this test to work due to circular object nonsense
          schemas: [schema, schema2],
        }),
        createMockDatabase({
          id: 101,
          name: "mySchemalessDatabase",
          engine: "mysql",
        }),
      ],
      schemas: [schema, schema2],
      tables: [
        createMockTable({ id: 300, db_id: 100, display_name: "myTable" }),
        createMockTable({
          id: 301,
          db_id: 101,
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
        metadata,
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
        metadata,
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
