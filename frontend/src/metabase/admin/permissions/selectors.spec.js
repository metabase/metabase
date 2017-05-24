/**
 * This test simulates a scenario where permissions to a database with multiple schemas (like Redshift)
 * and multiple user groups are being modified using the methods provided by the getXPermissionsGrid selectors.
 */

jest.mock('metabase/lib/analytics');

import {GroupsPermissions} from "metabase/meta/types/Permissions";
import { denormalizedMetadata } from "./selectors.spec.fixtures";
import { getTablesPermissionsGrid, getSchemasPermissionsGrid, getDatabasesPermissionsGrid } from "./selectors";
import Metadata from "metabase/meta/metadata/Metadata";

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

const reduxState = {
    admin: {
        permissions: {
            permissions: initialPermissions,
            originalPermissions: initialPermissions,
            groups,
            databases: denormalizedMetadata.databases
        }
    }
};

const getProps = ({ databaseId, schemaName }) => ({
    params: {
        databaseId,
            schemaName
    }
});

describe("permissions selectors", () => {
    const sampleDatasetEntityId = {databaseId: 1, schemaName: "PUBLIC"};

    it("should behave correctly when restricting access to the sample dataset", () => {
        const grid = getTablesPermissionsGrid(reduxState, getProps(sampleDatasetEntityId));
        const updatedPermissions = grid.permissions.fields.updater(1, {...sampleDatasetEntityId, tableId: 1}, "none");

        expect(updatedPermissions).toMatchObject({
           "1": {
               "1": {
                   // should downgrade to read native permission
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
    });
    // it("should behave correctly when granting more access to the sample dataset", () => {
    //
    // });
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
