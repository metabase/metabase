import { AngularResourceProxy, createThunkAction, handleActions, combineReducers } from "metabase/lib/redux";

const MetabaseAPI = new AngularResourceProxy("Metabase", ["db_list"]);
const PermissionsAPI = new AngularResourceProxy("Permissions", ["groups", "groupDetails", "databaseDetails", "databasePermissions", "schemaPermissions"]);
const UsersAPI = new AngularResourceProxy("User", ["list"]);

export const FETCH_PERMISSIONS_GROUPS = "FETCH_PERMISSIONS_GROUPS";
export const FETCH_PERMISSIONS_GROUP_DETAILS = "FETCH_PERMISSIONS_GROUP_DETAILS";
export const FETCH_DATABASES = "FETCH_DATABASES";
export const FETCH_DATABASE_PERMISSIONS_DETAILS = "FETCH_DATABASE_PERMISSIONS_DETAILS";
export const FETCH_DATABASE_PERMISSIONS = "FETCH_DATABASE_PERMISSIONS";
export const PERMISSIONS_FETCH_USERS = "PERMISSIONS_FETCH_USERS";
export const FETCH_SCHEMA_PERMISSIONS = "FETCH_SCHEMA_PERMISSIONS";

// ACTIONS

function thunkActionHandler(actionType, APIFunction, prepareArgsFn) {
    return createThunkAction(actionType, function() {
        const args = arguments;
        return async function(dispatch, getState) {
            return await APIFunction.apply(null, prepareArgsFn ? prepareArgsFn.apply(null, args) : args);
        };
    });
}

export const fetchGroups = thunkActionHandler(FETCH_PERMISSIONS_GROUPS, PermissionsAPI.groups);
export const fetchDatabases = thunkActionHandler(FETCH_DATABASES, MetabaseAPI.db_list);
export const fetchGroupDetails = thunkActionHandler(FETCH_PERMISSIONS_GROUP_DETAILS, PermissionsAPI.groupDetails,
                                                        (id) => [{id: id}]);
export const fetchDatabaseDetails = thunkActionHandler(FETCH_DATABASE_PERMISSIONS_DETAILS, PermissionsAPI.databaseDetails,
                                                           (id) => [{id: id}]);
export const fetchDatabasePermissions = thunkActionHandler(FETCH_DATABASE_PERMISSIONS, PermissionsAPI.databasePermissions,
                                                               (databaseID, groupID) => [{databaseID: databaseID, groupID: groupID}]);
export const fetchUsers = thunkActionHandler(PERMISSIONS_FETCH_USERS, UsersAPI.list);
export const fetchSchemaPermissions = thunkActionHandler(FETCH_SCHEMA_PERMISSIONS, PermissionsAPI.schemaPermissions);

function actionHandler(actionType) {
    return handleActions({
        [actionType]: {
            next: function(state, { payload }) {
                return payload;
            }
        }
    }, null);
}

// REDUCERS
const groups = actionHandler(FETCH_PERMISSIONS_GROUPS);
const group = actionHandler(FETCH_PERMISSIONS_GROUP_DETAILS);
const databases = actionHandler(FETCH_DATABASES);
const database = actionHandler(FETCH_DATABASE_PERMISSIONS_DETAILS);
const databasePermissions = actionHandler(FETCH_DATABASE_PERMISSIONS);
const users = actionHandler(PERMISSIONS_FETCH_USERS);
const schemaPermissions = actionHandler(FETCH_SCHEMA_PERMISSIONS);

export default combineReducers({
    groups,
    group,
    databases,
    database,
    databasePermissions,
    users,
    schemaPermissions
});
