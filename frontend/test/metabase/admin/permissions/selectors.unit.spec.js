/**
 * Tests granting and revoking permissions against three kinds of datasets:
 * - dataset with tables in a single PUBLIC schema (for instance H2 or PostgreSQL if no custom schemas created)
 * - dataset with no schemas (for instance MySQL)
 * - dataset with multiple schemas (for instance Redshift)
 */

import { setIn } from "icepick";

jest.mock("metabase/lib/analytics");
jest.mock("metabase/containers/CollectionSelect");

import { normalizedMetadata } from "./selectors.unit.spec.fixtures";
import {
  getTablesPermissionsGrid,
  getSchemasPermissionsGrid,
  getDatabasesPermissionsGrid,
  getDatabaseTablesOrSchemasPath,
} from "metabase/admin/permissions/selectors";

/******** INITIAL TEST STATE ********/

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

/******** MANAGING THE CURRENT (SIMULATED) STATE TREE ********/

const initialState = {
  admin: {
    permissions: {
      permissions: initialPermissions,
      originalPermissions: initialPermissions,
    },
  },
  entities: normalizedMetadata,
};

let state = initialState;
const resetState = () => {
  state = initialState;
};
const getPermissionsTree = () => state.admin.permissions.permissions;
const getPermissionsForDb = ({ entityId, groupId }) =>
  getPermissionsTree()[groupId][entityId.databaseId];

const updatePermissionsInState = permissions => {
  state = setIn(state, ["admin", "permissions", "permissions"], permissions);
};

const getProps = ({ databaseId, schemaName }) => ({
  params: {
    databaseId,
    schemaName,
  },
});

/******** HIGH-LEVEL METHODS FOR UPDATING PERMISSIONS ********/

const changePermissionsForEntityInGrid = ({
  grid,
  category,
  entityId,
  groupId,
  permission,
}) => {
  const newPermissions = grid.permissions[category].updater(
    groupId,
    entityId,
    permission,
  );
  updatePermissionsInState(newPermissions);
  return newPermissions;
};

const changeDbNativePermissionsForEntity = ({
  entityId,
  groupId,
  permission,
}) => {
  const grid = getDatabasesPermissionsGrid(state, getProps(entityId));
  return changePermissionsForEntityInGrid({
    grid,
    category: "native",
    entityId,
    groupId,
    permission,
  });
};

const changeDbDataPermissionsForEntity = ({
  entityId,
  groupId,
  permission,
}) => {
  const grid = getDatabasesPermissionsGrid(state, getProps(entityId));
  return changePermissionsForEntityInGrid({
    grid,
    category: "schemas",
    entityId,
    groupId,
    permission,
  });
};

const changeSchemaPermissionsForEntity = ({
  entityId,
  groupId,
  permission,
}) => {
  const grid = getSchemasPermissionsGrid(state, getProps(entityId));
  return changePermissionsForEntityInGrid({
    grid,
    category: "tables",
    entityId,
    groupId,
    permission,
  });
};

const changeTablePermissionsForEntity = ({ entityId, groupId, permission }) => {
  const grid = getTablesPermissionsGrid(state, getProps(entityId));
  return changePermissionsForEntityInGrid({
    grid,
    category: "fields",
    entityId,
    groupId,
    permission,
  });
};

const getMethodsForDbAndSchema = entityId => ({
  changeDbNativePermissions: ({ groupId, permission }) =>
    changeDbNativePermissionsForEntity({ entityId, groupId, permission }),
  changeDbDataPermissions: ({ groupId, permission }) =>
    changeDbDataPermissionsForEntity({ entityId, groupId, permission }),
  changeSchemaPermissions: ({ groupId, permission }) =>
    changeSchemaPermissionsForEntity({ entityId, groupId, permission }),
  changeTablePermissions: ({ tableId, groupId, permission }) =>
    changeTablePermissionsForEntity({
      entityId: { ...entityId, tableId },
      groupId,
      permission,
    }),
  getPermissions: ({ groupId }) => getPermissionsForDb({ entityId, groupId }),
});

/******** ACTUAL TESTS ********/

describe("permissions selectors", () => {
  beforeEach(resetState);

  describe("for a schemaless dataset", () => {
    // Schema "name" (better description would be a "permission path identifier") is simply an empty string
    // for databases where the metadata value for table schema is `null`
    const schemalessDataset = getMethodsForDbAndSchema({
      databaseId: 3,
      schemaName: null,
    });

    it("should restrict access correctly on table level", () => {
      // Revoking access to one table should downgrade the native permissions to "read"
      schemalessDataset.changeTablePermissions({
        tableId: 10,
        groupId: 1,
        permission: "none",
      });
      expect(schemalessDataset.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: {
          "": {
            "10": "none",
            "11": "all",
            "12": "all",
            "13": "all",
          },
        },
      });

      // Revoking access to the rest of tables one-by-one...
      schemalessDataset.changeTablePermissions({
        tableId: 11,
        groupId: 1,
        permission: "none",
      });
      schemalessDataset.changeTablePermissions({
        tableId: 12,
        groupId: 1,
        permission: "none",
      });
      schemalessDataset.changeTablePermissions({
        tableId: 13,
        groupId: 1,
        permission: "none",
      });

      expect(schemalessDataset.getPermissions({ groupId: 1 })).toMatchObject({
        // ...should revoke all permissions for that database
        native: "none",
        schemas: "none",
      });
    });

    it("should restrict access correctly on db level", () => {
      // Should not let change the native permission to none
      schemalessDataset.changeDbNativePermissions({
        groupId: 1,
        permission: "none",
      });
      expect(schemalessDataset.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "all",
      });

      resetState(); // ad-hoc state reset for the next test
      // Revoking the data access to the database at once should revoke all permissions for that database
      schemalessDataset.changeDbDataPermissions({
        groupId: 1,
        permission: "none",
      });
      expect(schemalessDataset.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "none",
      });
    });

    it("should grant more access correctly on table level", () => {
      // Simply grant an access to a single table
      schemalessDataset.changeTablePermissions({
        tableId: 12,
        groupId: 2,
        permission: "all",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          "": {
            "10": "none",
            "11": "none",
            "12": "all",
            "13": "none",
          },
        },
      });

      // Grant the access to rest of tables
      schemalessDataset.changeTablePermissions({
        tableId: 10,
        groupId: 2,
        permission: "all",
      });
      schemalessDataset.changeTablePermissions({
        tableId: 11,
        groupId: 2,
        permission: "all",
      });
      schemalessDataset.changeTablePermissions({
        tableId: 13,
        groupId: 2,
        permission: "all",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: "all",
      });

      // Should pass changes to native permissions through
      schemalessDataset.changeDbNativePermissions({
        groupId: 2,
        permission: "write",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "write",
        schemas: "all",
      });
    });

    it("should grant more access correctly on db level", () => {
      // Setting limited access should produce a permission tree where each schema has "none" access
      // (this is a strange, rather no-op edge case but the UI currently enables this)
      schemalessDataset.changeDbDataPermissions({
        groupId: 2,
        permission: "controlled",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          "": "none",
        },
      });

      // Granting native access should also grant a full write access
      schemalessDataset.changeDbNativePermissions({
        groupId: 2,
        permission: "write",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "write",
        schemas: "all",
      });

      resetState(); // ad-hoc reset (normally run before tests)
      // test that setting full access works too
      schemalessDataset.changeDbDataPermissions({
        groupId: 2,
        permission: "all",
      });
      expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: "all",
      });
    });
  });

  describe("for a dataset with multiple schemas", () => {
    const schema1 = getMethodsForDbAndSchema({
      databaseId: 2,
      schemaName: "schema_1",
    });
    const schema2 = getMethodsForDbAndSchema({
      databaseId: 2,
      schemaName: "schema_2",
    });

    it("should restrict access correctly on table level", () => {
      // Revoking access to one table should downgrade the native permissions to "none"
      schema1.changeTablePermissions({
        tableId: 5,
        groupId: 1,
        permission: "none",
      });
      expect(schema1.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: {
            "5": "none",
            "6": "all",
          },
          schema_2: "all",
        },
      });

      // State where both schemas have mixed permissions
      schema2.changeTablePermissions({
        tableId: 8,
        groupId: 1,
        permission: "none",
      });
      schema2.changeTablePermissions({
        tableId: 9,
        groupId: 1,
        permission: "none",
      });
      expect(schema2.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: {
            "5": "none",
            "6": "all",
          },
          schema_2: {
            "7": "all",
            "8": "none",
            "9": "none",
          },
        },
      });

      // Completely revoke access to the first schema with table-level changes
      schema1.changeTablePermissions({
        tableId: 6,
        groupId: 1,
        permission: "none",
      });

      expect(schema1.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: "none",
          schema_2: {
            "7": "all",
            "8": "none",
            "9": "none",
          },
        },
      });

      // Revoking all permissions of the other schema should revoke all db permissions too
      schema2.changeTablePermissions({
        tableId: 7,
        groupId: 1,
        permission: "none",
      });
      expect(schema2.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "none",
      });
    });

    it("should restrict access correctly on schema level", () => {
      // Revoking access to one schema
      schema2.changeSchemaPermissions({ groupId: 1, permission: "none" });
      expect(schema2.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: "all",
          schema_2: "none",
        },
      });

      // Revoking access to other too
      schema1.changeSchemaPermissions({ groupId: 1, permission: "none" });
      expect(schema1.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "none",
      });
    });

    it("should restrict access correctly on db level", () => {
      // Should let change the native permission to none
      schema1.changeDbNativePermissions({ groupId: 1, permission: "none" });
      expect(schema1.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "all",
      });

      resetState(); // ad-hoc state reset for the next test
      // Revoking the data access to the database at once should revoke all permissions for that database
      schema1.changeDbDataPermissions({ groupId: 1, permission: "none" });
      expect(schema1.getPermissions({ groupId: 1 })).toMatchObject({
        native: "none",
        schemas: "none",
      });
    });

    it("should grant more access correctly on table level", () => {
      // Simply grant an access to a single table
      schema2.changeTablePermissions({
        tableId: 7,
        groupId: 2,
        permission: "all",
      });
      expect(schema2.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: "none",
          schema_2: {
            "7": "all",
            "8": "none",
            "9": "none",
          },
        },
      });

      // State where both schemas have mixed permissions
      schema1.changeTablePermissions({
        tableId: 5,
        groupId: 2,
        permission: "all",
      });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: {
            "5": "all",
            "6": "none",
          },
          schema_2: {
            "7": "all",
            "8": "none",
            "9": "none",
          },
        },
      });

      // Grant full access to the second schema
      schema2.changeTablePermissions({
        tableId: 8,
        groupId: 2,
        permission: "all",
      });
      schema2.changeTablePermissions({
        tableId: 9,
        groupId: 2,
        permission: "all",
      });
      expect(schema2.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: {
            "5": "all",
            "6": "none",
          },
          schema_2: "all",
        },
      });

      // Grant the access to whole db (no native yet)
      schema1.changeTablePermissions({
        tableId: 5,
        groupId: 2,
        permission: "all",
      });
      schema1.changeTablePermissions({
        tableId: 6,
        groupId: 2,
        permission: "all",
      });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: "all",
      });

      // Should pass changes to native permissions through
      schema1.changeDbNativePermissions({ groupId: 2, permission: "write" });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "write",
        schemas: "all",
      });
    });

    it("should grant more access correctly on schema level", () => {
      // Granting full access to one schema
      schema1.changeSchemaPermissions({ groupId: 2, permission: "all" });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: "all",
          schema_2: "none",
        },
      });

      // Granting access to the other as well
      schema2.changeSchemaPermissions({ groupId: 2, permission: "all" });
      expect(schema2.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: "all",
      });
    });

    it("should grant more access correctly on db level", () => {
      // Setting limited access should produce a permission tree where each schema has "none" access
      // (this is a strange, rather no-op edge case but the UI currently enables this)
      schema1.changeDbDataPermissions({ groupId: 2, permission: "controlled" });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: {
          schema_1: "none",
          schema_2: "none",
        },
      });

      // Granting native access should also grant a full write access
      schema1.changeDbNativePermissions({ groupId: 2, permission: "write" });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "write",
        schemas: "all",
      });

      resetState(); // ad-hoc reset (normally run before tests)
      // test that setting full access works too
      schema1.changeDbDataPermissions({ groupId: 2, permission: "all" });
      expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
        native: "none",
        schemas: "all",
      });
    });
  });
});

describe("getDatabaseTablesOrSchemasPath", () => {
  it("should return path for schema-less db", () => {
    const database = { id: 1, schemaNames: () => [null] };
    expect(getDatabaseTablesOrSchemasPath(database)).toBe(
      "/admin/permissions/databases/1/tables",
    );
  });

  it("should return path for db with no schemas", () => {
    const database = { id: 1, schemaNames: () => [] };
    expect(getDatabaseTablesOrSchemasPath(database)).toBe(
      "/admin/permissions/databases/1/schemas",
    );
  });

  it("should return path for db with a single schema", () => {
    const database = { id: 1, schemaNames: () => ["foo"] };
    expect(getDatabaseTablesOrSchemasPath(database)).toBe(
      "/admin/permissions/databases/1/schemas/foo/tables",
    );
  });

  it("should return path for db with multiple schemas", () => {
    const database = { id: 1, schemaNames: () => ["foo", "bar"] };
    expect(getDatabaseTablesOrSchemasPath(database)).toBe(
      "/admin/permissions/databases/1/schemas",
    );
  });
});
