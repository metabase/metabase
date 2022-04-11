import { getDataFocusSidebar } from ".";
import { RawDataRouteParams } from "../../types";
import { state } from "./data-permissions.unit.spec.fixtures";

export const getRouteProps = ({
  databaseId,
  schemaName,
  tableId,
}: RawDataRouteParams) => ({
  params: {
    databaseId,
    schemaName,
    tableId,
  },
});

describe("getDataFocusSidebar", () => {
  describe("when database is not selected", () => {
    it("returns a correct placeholder for databases list search", () => {
      const sidebarData = getDataFocusSidebar(
        state as any,
        getRouteProps({ databaseId: undefined }),
      );

      expect(sidebarData?.filterPlaceholder).toEqual("Search for a database");
    });

    it("returns list of databases", () => {
      const sidebarData = getDataFocusSidebar(state as any, getRouteProps({}));

      expect(sidebarData?.entityGroups).toEqual([
        [
          {
            entityId: {
              databaseId: 2,
            },
            icon: "database",
            id: 2,
            name: "Imaginary Multi-Schema Dataset",
          },
          {
            entityId: {
              databaseId: 3,
            },
            icon: "database",
            id: 3,
            name: "Imaginary Schemaless Dataset",
          },
        ],
      ]);
    });
  });

  describe("when a database is selected", () => {
    it("returns a correct placeholder for databases list search", () => {
      const sidebarData = getDataFocusSidebar(
        state as any,
        getRouteProps({ databaseId: "2" }),
      );

      expect(sidebarData?.filterPlaceholder).toEqual("Search for a table");
    });

    it("returns tree of schemas and tables for a database with schemas", () => {
      const sidebarData = getDataFocusSidebar(
        state as any,
        getRouteProps({ databaseId: "2" }),
      );

      expect(sidebarData?.entityGroups).toEqual([
        [
          {
            children: [
              {
                entityId: {
                  databaseId: 2,
                  schemaName: "schema_1",
                  tableId: 5,
                },
                icon: "table",
                id: "table:5",
                name: "Avian Singles Messages",
              },
              {
                entityId: {
                  databaseId: 2,
                  schemaName: "schema_1",
                  tableId: 6,
                },
                icon: "table",
                id: "table:6",
                name: "Avian Singles Users",
              },
            ],
            entityId: {
              databaseId: 2,
              schemaName: "schema_1",
            },
            icon: "folder",
            id: "schema:schema_1",
            name: "schema_1",
          },
          {
            children: [
              {
                entityId: {
                  databaseId: 2,
                  schemaName: "schema_2",
                  tableId: 8,
                },
                icon: "table",
                id: "table:8",
                name: "Tupac Sightings Categories",
              },
              {
                entityId: {
                  databaseId: 2,
                  schemaName: "schema_2",
                  tableId: 9,
                },
                icon: "table",
                id: "table:9",
                name: "Tupac Sightings Cities",
              },
              {
                entityId: {
                  databaseId: 2,
                  schemaName: "schema_2",
                  tableId: 7,
                },
                icon: "table",
                id: "table:7",
                name: "Tupac Sightings Sightings",
              },
            ],
            entityId: {
              databaseId: 2,
              schemaName: "schema_2",
            },
            icon: "folder",
            id: "schema:schema_2",
            name: "schema_2",
          },
        ],
      ]);
    });

    it("returns flat list of tables for a schemaless database", () => {
      const sidebarData = getDataFocusSidebar(
        state as any,
        getRouteProps({ databaseId: "3" }),
      );

      expect(sidebarData?.entityGroups).toEqual([
        [
          {
            entityId: {
              databaseId: 3,
              schemaName: null,
              tableId: 10,
            },
            icon: "table",
            id: "table:10",
            name: "Badminton Men's Double Results",
          },
          {
            entityId: {
              databaseId: 3,
              schemaName: null,
              tableId: 11,
            },
            icon: "table",
            id: "table:11",
            name: "Badminton Mixed Double Results",
          },
          {
            entityId: {
              databaseId: 3,
              schemaName: null,
              tableId: 13,
            },
            icon: "table",
            id: "table:13",
            name: "Badminton Mixed Singles Results",
          },
          {
            entityId: {
              databaseId: 3,
              schemaName: null,
              tableId: 12,
            },
            icon: "table",
            id: "table:12",
            name: "Badminton Women's Singles Results",
          },
        ],
      ]);
    });
  });
});
