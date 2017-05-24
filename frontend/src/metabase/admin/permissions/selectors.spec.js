/**
 * Tests granting and revoking permissions against three kinds of datasets:
 * - dataset with tables in a single PUBLIC schema (for instance H2 or PostgreSQL if no custom schemas created)
 * - dataset with no schemas (for instance MySQL)
 * - dataset with multiple schemas (for instance Redshift)
 */

import { setIn } from "icepick";

jest.mock('metabase/lib/analytics');

import {GroupsPermissions} from "metabase/meta/types/Permissions";
import { denormalizedMetadata } from "./selectors.spec.fixtures";
import { getTablesPermissionsGrid, getSchemasPermissionsGrid, getDatabasesPermissionsGrid } from "./selectors";

/******** INITIAL TEST STATE ********/

const groups = [{
    id: 1,
    name: "Group starting with full access",
}, {
    id: 2,
    name: "Group starting with no access at all",
}];

const initialPermissions: GroupsPermissions = {
    1: {
        // Sample dataset
        1: {
            "native": "write",
            "schemas": "all"
        },
        // Imaginary multi-schema
        2: {
            "native": "write",
            "schemas": "all"
        },
        // Imaginary schemaless
        3: {
            "native": "write",
            "schemas": "all"
        }
    },
    2: {
        // Sample dataset
        1: {
            "native": "none",
            "schemas": "none"
        },
        // Imaginary multi-schema
        2: {
            "native": "none",
            "schemas": "none"
        },
        // Imaginary schemaless
        3: {
            "native": "none",
            "schemas": "none"
        }
    }
};


/******** MANAGING THE CURRENT (SIMULATED) STATE TREE ********/

const initialState = {
    admin: {
        permissions: {
            permissions: initialPermissions,
            originalPermissions: initialPermissions,
            groups,
            databases: denormalizedMetadata.databases
        }
    }
};

var state = initialState;
const resetState = () => { state = initialState };
const getPermissionsTree = () => state.admin.permissions.permissions;
const getPermissionsForDb = ({ entityId, groupId }) => getPermissionsTree()[groupId][entityId.databaseId];

const updatePermissionsInState = (permissions) => {
    state = setIn(state, ["admin", "permissions", "permissions"], permissions);
};

const getProps = ({ databaseId, schemaName }) => ({
    params: {
        databaseId,
            schemaName
    }
});

/******** HIGH-LEVEL METHODS FOR UPDATING PERMISSIONS ********/

const changePermissionsForEntityInGrid = ({ grid, category, entityId, groupId, permission }) => {
    const newPermissions = grid.permissions[category].updater(groupId, entityId, permission);
    updatePermissionsInState(newPermissions);
    return newPermissions;
};

const changeDbNativePermissionsForEntity = ({ entityId, groupId, permission }) => {
    const grid = getDatabasesPermissionsGrid(state, getProps(entityId));
    return changePermissionsForEntityInGrid({ grid, category: "native", entityId, groupId, permission });
};

const changeDbDataPermissionsForEntity = ({ entityId, groupId, permission }) => {
    const grid = getDatabasesPermissionsGrid(state, getProps(entityId));
    return changePermissionsForEntityInGrid({ grid, category: "schemas", entityId, groupId, permission });
};

const changeSchemaPermissionsForEntity = ({ entityId, groupId, permission }) => {
    const grid = getSchemasPermissionsGrid(state, getProps(entityId));
    return changePermissionsForEntityInGrid({ grid, category: "tables", entityId, groupId, permission });
};

const changeTablePermissionsForEntity = ({ entityId, groupId, permission }) => {
    const grid = getTablesPermissionsGrid(state, getProps(entityId));
    return changePermissionsForEntityInGrid({ grid, category: "fields", entityId, groupId, permission });
};

const getMethodsForDbAndSchema = (entityId) => ({
    changeDbNativePermissions: ({ groupId, permission }) =>
        changeDbNativePermissionsForEntity({ entityId, groupId, permission }),
    changeDbDataPermissions: ({ groupId, permission }) =>
        changeDbDataPermissionsForEntity({ entityId, groupId, permission }),
    changeTablePermissions: ({ tableId, groupId, permission }) =>
        changeTablePermissionsForEntity({ entityId: {...entityId, tableId}, groupId, permission }),
    getPermissions: ({ groupId }) =>
        getPermissionsForDb({ entityId, groupId })
});

/******** ACTUAL TESTS ********/

describe("permissions selectors", () => {
    beforeEach(resetState);

    // TODO: Consider the removal of this test as multi-schema scenario is more extensive
    describe("for a sample dataset", () => {
        const sampleDataset = getMethodsForDbAndSchema({ databaseId: 1, schemaName: "PUBLIC" });

        it("should restrict access correctly on table level", () => {
            // Revoking access to one table should downgrade the native permissions to "read"
            sampleDataset.changeTablePermissions({ tableId: 1, groupId: 1, permission: "none" });
            expect(sampleDataset.getPermissions({ groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": {
                    "PUBLIC": {
                        "1": "none",
                        "2": "all",
                        "3": "all",
                        "4": "all"
                    }
                }
            });

            // Revoking access to the rest of tables one-by-one...
            sampleDataset.changeTablePermissions({ tableId: 2, groupId: 1, permission: "none" });
            sampleDataset.changeTablePermissions({ tableId: 3, groupId: 1, permission: "none" });
            sampleDataset.changeTablePermissions({ tableId: 4, groupId: 1, permission: "none" });
            expect(sampleDataset.getPermissions({groupId: 1})).toMatchObject({
                // ...should revoke all permissions for that database
                "native": "none",
                "schemas": "none"
            });

        });

        it("should restrict access correctly on db level", () => {
            // Should let change the native permission to "read"
            sampleDataset.changeDbNativePermissions({ groupId: 1, permission: "read" });
            expect(sampleDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": "all"
            });

            // Should not let change the native permission to none
            sampleDataset.changeDbNativePermissions({ groupId: 1, permission: "none" });
            expect(sampleDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });

            resetState(); // ad-hoc state reset for the next test
            // Revoking the data access to the database at once should revoke all permissions for that database
            sampleDataset.changeDbDataPermissions({ groupId: 1, permission: "none" });
            expect(sampleDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "none"
            });
        });

        it("should grant more access correctly on table level", () => {
            // Simply grant an access to a single table
            sampleDataset.changeTablePermissions({ tableId: 3, groupId: 2, permission: "all" });
            expect(sampleDataset.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": {
                    "PUBLIC": {
                        "1": "none",
                        "2": "none",
                        "3": "all",
                        "4": "none"
                    }
                }
            });

            // Grant the access to rest of tables
            sampleDataset.changeTablePermissions({ tableId: 1, groupId: 2, permission: "all" });
            sampleDataset.changeTablePermissions({ tableId: 2, groupId: 2, permission: "all" });
            sampleDataset.changeTablePermissions({ tableId: 4, groupId: 2, permission: "all" });
            expect(sampleDataset.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });


            // Should pass changes to native permissions through
            sampleDataset.changeDbNativePermissions({ groupId: 2, permission: "read" });
            expect(sampleDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "read",
                "schemas": "all"
            });
        });

        it("should grant more access correctly on db level", () => {
            // Setting limited access should produce a permission tree where each schema has "none" access
            // (this is a strange, rather no-op edge case but the UI currently enables this)
            sampleDataset.changeDbDataPermissions({ groupId: 2, permission: "controlled" });
            expect(sampleDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": {
                    "PUBLIC": "none"
                }
            });

            // Granting native access should also grant a full write access
            sampleDataset.changeDbNativePermissions({ groupId: 2, permission: "write" });
            expect(sampleDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "write",
                "schemas": "all"
            });

            resetState(); // ad-hoc reset (normally run before tests)
            // test that setting full access works too
            sampleDataset.changeDbDataPermissions({ groupId: 2, permission: "all" });
            expect(sampleDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": "all"
            });
        })
    });

    describe("for a schemaless dataset", () => {
        // Schema "name" (better description would be a "permission path identifier") is simply an empty string
        // for databases where the metadata value for table schema is `null`
        const schemalessDataset = getMethodsForDbAndSchema({ databaseId: 3, schemaName: "" });

        it("should restrict access correctly on table level", () => {
            // Revoking access to one table should downgrade the native permissions to "read"
            schemalessDataset.changeTablePermissions({ tableId: 10, groupId: 1, permission: "none" });
            expect(schemalessDataset.getPermissions({ groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": {
                    "": {
                        "10": "none",
                        "11": "all",
                        "12": "all",
                        "13": "all"
                    }
                }
            });

            // Revoking access to the rest of tables one-by-one...
            schemalessDataset.changeTablePermissions({ tableId: 11, groupId: 1, permission: "none" });
            schemalessDataset.changeTablePermissions({ tableId: 12, groupId: 1, permission: "none" });
            schemalessDataset.changeTablePermissions({ tableId: 13, groupId: 1, permission: "none" });

            expect(schemalessDataset.getPermissions({groupId: 1})).toMatchObject({
                // ...should revoke all permissions for that database
                "native": "none",
                "schemas": "none"
            });

        });

        it("should restrict access correctly on db level", () => {
            // Should let change the native permission to "read"
            schemalessDataset.changeDbNativePermissions({ groupId: 1, permission: "read" });
            expect(schemalessDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": "all"
            });

            // Should not let change the native permission to none
            schemalessDataset.changeDbNativePermissions({ groupId: 1, permission: "none" });
            expect(schemalessDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });

            resetState(); // ad-hoc state reset for the next test
            // Revoking the data access to the database at once should revoke all permissions for that database
            schemalessDataset.changeDbDataPermissions({ groupId: 1, permission: "none" });
            expect(schemalessDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "none"
            });
        });

        it("should grant more access correctly on table level", () => {
            // Simply grant an access to a single table
            schemalessDataset.changeTablePermissions({ tableId: 12, groupId: 2, permission: "all" });
            expect(schemalessDataset.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": {
                    "": {
                        "10": "none",
                        "11": "none",
                        "12": "all",
                        "13": "none"
                    }
                }
            });

            // Grant the access to rest of tables
            schemalessDataset.changeTablePermissions({ tableId: 10, groupId: 2, permission: "all" });
            schemalessDataset.changeTablePermissions({ tableId: 11, groupId: 2, permission: "all" });
            schemalessDataset.changeTablePermissions({ tableId: 13, groupId: 2, permission: "all" });
            expect(schemalessDataset.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });


            // Should pass changes to native permissions through
            schemalessDataset.changeDbNativePermissions({ groupId: 2, permission: "read" });
            expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "read",
                "schemas": "all"
            });
        });

        it("should grant more access correctly on db level", () => {
            // Setting limited access should produce a permission tree where each schema has "none" access
            // (this is a strange, rather no-op edge case but the UI currently enables this)
            schemalessDataset.changeDbDataPermissions({ groupId: 2, permission: "controlled" });
            expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": {
                    "": "none"
                }
            });

            // Granting native access should also grant a full write access
            schemalessDataset.changeDbNativePermissions({ groupId: 2, permission: "write" });
            expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "write",
                "schemas": "all"
            });

            resetState(); // ad-hoc reset (normally run before tests)
            // test that setting full access works too
            schemalessDataset.changeDbDataPermissions({ groupId: 2, permission: "all" });
            expect(schemalessDataset.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": "all"
            });
        })
    });

    describe("for a dataset with schemas", () => {
        const schema1 = getMethodsForDbAndSchema({ databaseId: 2, schemaName: "schema_1" });
        const schema2 = getMethodsForDbAndSchema({ databaseId: 2, schemaName: "schema_2" });

        it("should restrict access correctly on table level", () => {
            // Revoking access to one table should downgrade the native permissions to "read"
            schema1.changeTablePermissions({ tableId: 5, groupId: 1, permission: "none" });
            expect(schema1.getPermissions({ groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": {
                    "schema_1": {
                        "5": "none",
                        "6": "all"
                    },
                    "schema_2": "all"
                }
            });

            // Revoking access to the rest of tables in schema one-by-one
            schema1.changeTablePermissions({ tableId: 6, groupId: 1, permission: "none" });

            expect(schema1.getPermissions({groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": {
                    "schema_1": "none",
                    "schema_2": "all"
                }
            });

            // An intermediary state
            schema2.changeTablePermissions({ tableId: 8, groupId: 1, permission: "none" });
            schema2.changeTablePermissions({ tableId: 9, groupId: 1, permission: "none" });
            expect(schema2.getPermissions({groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": {
                    "schema_1": "none",
                    "schema_2": {
                        "7": "all",
                        "8": "none",
                        "9": "none"
                    }
                }
            });

            // Revoking all permissions of the other schema should revoke all db permissions too
            schema2.changeTablePermissions({ tableId: 7, groupId: 1, permission: "none" });
            expect(schema2.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "none"
            });
        });

        it("should restrict access correctly on db level", () => {
            // Should let change the native permission to "read"
            schema1.changeDbNativePermissions({ groupId: 1, permission: "read" });
            expect(schema1.getPermissions({groupId: 1})).toMatchObject({
                "native": "read",
                "schemas": "all"
            });

            // Should not let change the native permission to none
            schema1.changeDbNativePermissions({ groupId: 1, permission: "none" });
            expect(schema1.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });

            resetState(); // ad-hoc state reset for the next test
            // Revoking the data access to the database at once should revoke all permissions for that database
            schema1.changeDbDataPermissions({ groupId: 1, permission: "none" });
            expect(schema1.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "none"
            });
        });

        it("should grant more access correctly on schema level", () => {

        });

        it("should grant more access correctly on table level", () => {
            // Simply grant an access to a single table
            schema2.changeTablePermissions({ tableId: 7, groupId: 2, permission: "all" });
            expect(schema2.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": {
                    "schema_1": "none",
                    "schema_2": {
                        "7": "all",
                        "8": "none",
                        "9": "none"
                    }
                }
            });

            // Grant the access to rest of tables in that schema
            schema2.changeTablePermissions({ tableId: 8, groupId: 2, permission: "all" });
            schema2.changeTablePermissions({ tableId: 9, groupId: 2, permission: "all" });
            expect(schema2.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": {
                    "schema_1": "none",
                    "schema_2": "all"
                }
            });

            // Grant the access to whole db (no native yet)
            schema1.changeTablePermissions({ tableId: 5, groupId: 2, permission: "all" });
            schema1.changeTablePermissions({ tableId: 6, groupId: 2, permission: "all" });
            expect(schema1.getPermissions({groupId: 2})).toMatchObject({
                "native": "none",
                "schemas": "all"
            });

            // Should pass changes to native permissions through
            schema1.changeDbNativePermissions({ groupId: 2, permission: "read" });
            expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "read",
                "schemas": "all"
            });
        });

        it("should grant more access correctly on db level", () => {
            // Setting limited access should produce a permission tree where each schema has "none" access
            // (this is a strange, rather no-op edge case but the UI currently enables this)
            schema1.changeDbDataPermissions({ groupId: 2, permission: "controlled" });
            expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": {
                    "schema_1": "none",
                    "schema_2": "none"
                }
            });

            // Granting native access should also grant a full write access
            schema1.changeDbNativePermissions({ groupId: 2, permission: "write" });
            expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "write",
                "schemas": "all"
            });

            resetState(); // ad-hoc reset (normally run before tests)
            // test that setting full access works too
            schema1.changeDbDataPermissions({ groupId: 2, permission: "all" });
            expect(schema1.getPermissions({ groupId: 2 })).toMatchObject({
                "native": "none",
                "schemas": "all"
            });
        })
    });

    //
    // it("should behave correctly when restricting access to a multi-schema dataset", () => {
    //
    // });
    // it("should behave correctly when granting more access to a multi-schema dataset", () => {
    //
    // });
    //
    // it("should behave correctly when restricting access to a schemaless dataset", () => {
    //
    // });
    // it("should behave correctly when granting more access to a schemaless dataset", () => {
    //
    // });
});
