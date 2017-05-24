/**
 * This test simulates a scenario where permissions to a database with multiple schemas (like Redshift)
 * and multiple user groups are being modified using the methods provided by the getXPermissionsGrid selectors.
 */

import { setIn } from "icepick";

jest.mock('metabase/lib/analytics');

import {GroupsPermissions} from "metabase/meta/types/Permissions";
import { denormalizedMetadata } from "./selectors.spec.fixtures";
import { getTablesPermissionsGrid, getSchemasPermissionsGrid, getDatabasesPermissionsGrid } from "./selectors";

/******** INITIAL TEST STATE ********/

// Members of Group 1 have a full access to all databases but the admins plan to restrict its access
// Members of Group 2 has mixed very restricted access to databases, and admins want to grant them some more freedom
const groups = [{
    id: 1,
    name: "Executive team",
}, {
    id: 2,
    name: "Customer assistance team",
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
            "native": "none",
            "schemas": "none"
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
            "native": "read",
            "schemas": {
                "schema_1": "none",
                "schema_2": {
                    "7": "all",
                    "8": "none",
                    "9": "none",
                },
            }
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
    describe("for sample dataset", () => {
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
            // Revoking the data access to the database at once should revoke all permissions for that database
            resetState();
            sampleDataset.changeDbDataPermissions({ groupId: 1, permission: "none" });
            expect(sampleDataset.getPermissions({groupId: 1})).toMatchObject({
                "native": "none",
                "schemas": "none"
            });
        });

        it("should grant more access correctly on table level", () => {
            // Simply grant an access to a single table
            resetState();
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
        });
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
