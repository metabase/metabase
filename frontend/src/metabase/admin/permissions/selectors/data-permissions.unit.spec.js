import {
  getDatabasesSidebar,
  getGroupsDataPermissionEditor,
} from "./data-permissions";
import { normalizedMetadata } from "./data-permissions.unit.spec.fixtures";

const initialPermissions = {
  1: {
    // Sample dataset
    1: {
      native: "write",
      schemas: "all",
    },
    // Imaginary multi-schema
    2: {
      native: "write",
      schemas: "all",
    },
    // Imaginary schemaless
    3: {
      native: "write",
      schemas: "all",
    },
  },
  2: {
    // Sample dataset
    1: {
      native: "none",
      schemas: "none",
    },
    // Imaginary multi-schema
    2: {
      native: "none",
      schemas: "none",
    },
    // Imaginary schemaless
    3: {
      native: "none",
      schemas: "none",
    },
  },
};

const state = {
  admin: {
    permissions: {
      dataPermissions: initialPermissions,
      originalDataPermissions: initialPermissions,
    },
  },
  entities: normalizedMetadata,
};

const getProps = ({ databaseId, schemaName, tableId, groupId }) => ({
  params: {
    databaseId,
    schemaName,
    tableId,
    groupId,
  },
});

describe("getDatabasesSidebar", () => {
  describe("when database is not selected", () => {
    it("returns a correct placeholder for databases list search", () => {
      const sidebarData = getDatabasesSidebar(state, getProps({}));

      expect(sidebarData.filterPlaceholder).toEqual("Search for a database");
    });

    it("returns entity switch value = database", () => {
      const sidebarData = getDatabasesSidebar(state, getProps({}));

      expect(sidebarData.entitySwitch.value).toEqual("database");
    });

    it("returns list of databases", () => {
      const sidebarData = getDatabasesSidebar(state, getProps({}));

      expect(sidebarData.entityGroups).toEqual([
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
      const sidebarData = getDatabasesSidebar(
        state,
        getProps({ databaseId: 2 }),
      );

      expect(sidebarData.filterPlaceholder).toEqual("Search for a table");
    });

    it("returns tree of schemas and tables for a database with schemas", () => {
      const sidebarData = getDatabasesSidebar(
        state,
        getProps({ databaseId: 2 }),
      );

      expect(sidebarData.entityGroups).toEqual([
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
      const sidebarData = getDatabasesSidebar(
        state,
        getProps({ databaseId: 3 }),
      );

      expect(sidebarData.entityGroups).toEqual([
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

describe("getGroupsDataPermissionEditor", () => {
  it("returns data for permission editor header", () => {
    const permissionEditorData = getGroupsDataPermissionEditor(state, {
      params: {
        databaseId: 3,
      },
      entityQuery: null,
    });

    expect(permissionEditorData.title).toEqual("Permissions for");
    expect(permissionEditorData.breadcrumbs).toEqual([
      {
        id: 3,
        text: "Imaginary Schemaless Dataset",
        url: "/admin/permissions/data/database/3",
      },
    ]);
    expect(permissionEditorData.filterPlaceholder).toEqual(
      "Search for a group",
    );
  });

  it("returns entities list for permissions editor", () => {
    const entities = getGroupsDataPermissionEditor(state, {
      params: {
        databaseId: 3,
      },
      entityQuery: null,
    }).entities;

    expect(entities).toHaveLength(3);
    expect(entities.map(entity => entity.name)).toEqual([
      "Group starting with full access",
      "Group starting with no access at all",
      "All Users",
    ]);

    const [accessPermission, nativeQueryPermission] = entities[0].permissions;
    expect(accessPermission.value).toEqual("all");
    expect(accessPermission.options).toEqual([
      {
        icon: "check",
        iconColor: "success",
        label: "Unrestricted",
        value: "all",
      },
      {
        icon: "permissions_limited",
        iconColor: "warning",
        label: "Granular",
        value: "controlled",
      },
      {
        icon: "eye",
        iconColor: "accent5",
        label: "No self-service",
        value: "none",
      },
    ]);

    expect(nativeQueryPermission.value).toEqual("write");
    expect(nativeQueryPermission.options).toEqual([
      {
        icon: "check",
        iconColor: "success",
        label: "Yes",
        value: "write",
      },
      {
        icon: "close",
        iconColor: "danger",
        label: "No",
        value: "none",
      },
    ]);
  });
});
