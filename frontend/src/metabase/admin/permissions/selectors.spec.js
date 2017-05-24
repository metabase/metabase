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
            "native": "write",
            "schemas": "all"
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
            "native": "write",
            "schemas": "all"
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
const getPermissions = () => state.admin.permissions.permissions;
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

const changePermissionsForEntityInGrid = (grid, category, entityId, permission) => {
    const newPermissions = grid.permissions[category].updater(entityId.databaseId, entityId, permission);
    updatePermissionsInState(newPermissions);
    return newPermissions;
};

const changeDbDataPermissionsForEntity = (entityId, permission) => {
    const grid = getDatabasesPermissionsGrid(state, getProps(entityId));
    changePermissionsForEntityInGrid(grid, "schemas", entityId, permission);
};

const changeSchemaPermissionsForEntity = (entityId, permission) => {
    const grid = getSchemasPermissionsGrid(state, getProps(entityId));
    changePermissionsForEntityInGrid(grid, "tables", entityId, permission);
};

const changeTablePermissionsForEntity = (entityId, permission) => {
    const grid = getTablesPermissionsGrid(state, getProps(entityId));
    changePermissionsForEntityInGrid(grid, "fields", entityId, permission);
};

/******** ACTUAL TESTS ********/

describe("permissions selectors", () => {
    describe("for sample dataset", () => {
        // Local helpers for current database
        const sampleDatasetEntityId = {databaseId: 1, schemaName: "PUBLIC"};
        const changeDbDataPermissions = (permission) =>
            changeDbDataPermissionsForEntity(sampleDatasetEntityId, permission);
        const changeTablePermissions = (tableId, permission) =>
            changeTablePermissionsForEntity({...sampleDatasetEntityId, tableId}, permission);

        it("should restrict access correctly", () => {
            // Revoking access to one table...
            changeTablePermissions(1, "none");

            expect(getPermissions()).toMatchObject({
                "1": {
                    "1": {
                        // ...should downgrade the native permissions to "read"
                        "native": "read",
                        "schemas": {
                            "PUBLIC": {
                                "1": "none",
                                "2": "all",
                                "3": "all",
                                "4": "all"
                            }
                        }
                    }
                }
            });

            // Revoking access to the rest of tables one-by-one...
            changeTablePermissions(2, "none");
            changeTablePermissions(3, "none");
            changeTablePermissions(4, "none");

            expect(getPermissions()).toMatchObject({
                "1": {
                    "1": {
                        // ...should revoke all permissions for that database
                        "native": "none",
                        "schemas": "none"
                    }
                }
            });

            // Expect a similar result also when revoking the data access to the database at once
            resetState();
            changeDbDataPermissions("none");
            expect(getPermissions()).toMatchObject({
                "1": {
                    "1": {
                        // ...should revoke all permissions for that database
                        "native": "none",
                        "schemas": "none"
                    }
                }
            });
        });
    });

    it("should behave correctly when granting more access to the sample dataset", () => {

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
