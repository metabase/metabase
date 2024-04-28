import { assocIn } from "icepick";

import { userApi, sessionApi } from "metabase/api";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { generatePassword } from "metabase/lib/security";
import MetabaseSettings from "metabase/lib/settings";
import { UserSchema } from "metabase/schema";

export const DEACTIVATE = "metabase/entities/users/DEACTIVATE";
export const REACTIVATE = "metabase/entities/users/REACTIVATE";
export const PASSWORD_RESET_EMAIL =
  "metabase/entities/users/PASSWORD_RESET_EMAIL";
export const PASSWORD_RESET_MANUAL =
  "metabase/entities/users/RESET_PASSWORD_MANUAL";

// TODO: It'd be nice to import loadMemberships, but we need to resolve a circular dependency
function loadMemberships() {
  return require("metabase/admin/people/people").loadMemberships();
}

const getUserList = (query = {}, dispatch) =>
  entityCompatibleQuery(query, dispatch, userApi.endpoints.listUsers);
const getRecipientsList = (query = {}, dispatch) =>
  entityCompatibleQuery(query, dispatch, userApi.endpoints.listUserRecipients);

/**
 * @deprecated use "metabase/api" instead
 */
const Users = createEntity({
  name: "users",
  nameOne: "user",
  schema: UserSchema,

  path: "/api/user",

  api: {
    list: ({ recipients = false, ...args }, dispatch) =>
      recipients
        ? getRecipientsList({}, dispatch)
        : getUserList(args, dispatch),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        userApi.endpoints.createUser,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        userApi.endpoints.getUser,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        userApi.endpoints.updateUser,
      ),
    delete: () => {
      throw new TypeError("Users.api.delete is not supported");
    },
  },

  objectSelectors: {
    getName: user => user.common_name,
  },

  actionTypes: {
    DEACTIVATE,
    REACTIVATE,
    PASSWORD_RESET_EMAIL,
    PASSWORD_RESET_MANUAL,
  },

  actionDecorators: {
    create: thunkCreator => user => async (dispatch, getState) => {
      if (!MetabaseSettings.isEmailConfigured()) {
        user = {
          ...user,
          password: generatePassword(),
        };
      }
      const result = await thunkCreator(user)(dispatch, getState);

      dispatch(loadMemberships());
      return {
        // HACK: include user ID and password for temporaryPasswords reducer
        id: result.result,
        password: user.password,
        ...result,
      };
    },
    update: thunkCreator => user => async (dispatch, getState) => {
      const result = await thunkCreator(user)(dispatch, getState);
      if (user.user_group_memberships) {
        // group ids were just updated
        dispatch(loadMemberships());
      }
      return result;
    },
  },

  objectActions: {
    resetPasswordEmail:
      ({ email }) =>
      async dispatch => {
        MetabaseAnalytics.trackStructEvent(
          "People Admin",
          "Trigger User Password Reset",
        );
        await entityCompatibleQuery(
          email,
          dispatch,
          sessionApi.endpoints.forgotPassword,
        );
        dispatch({ type: PASSWORD_RESET_EMAIL });
      },
    resetPasswordManual:
      async ({ id }, password = generatePassword()) =>
      async dispatch => {
        MetabaseAnalytics.trackStructEvent(
          "People Admin",
          "Manual Password Reset",
        );
        await entityCompatibleQuery(
          { id, password },
          dispatch,
          userApi.endpoints.updatePassword,
        );
        dispatch({ type: PASSWORD_RESET_MANUAL, payload: { id, password } });
      },
    deactivate:
      ({ id }) =>
      async dispatch => {
        MetabaseAnalytics.trackStructEvent("People Admin", "User Removed");

        await entityCompatibleQuery(
          id,
          dispatch,
          userApi.endpoints.deactivateUser,
        );
        dispatch({ type: DEACTIVATE, payload: { id } });
      },
    reactivate:
      ({ id }) =>
      async dispatch => {
        MetabaseAnalytics.trackStructEvent("People Admin", "User Reactivated");

        const user = await entityCompatibleQuery(
          id,
          dispatch,
          userApi.endpoints.reactivateUser,
        );
        dispatch({ type: REACTIVATE, payload: user });
      },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (error) {
      return state;
    }
    switch (type) {
      case DEACTIVATE:
        return assocIn(state, [payload.id, "is_active"], false);
      case REACTIVATE:
        return assocIn(state, [payload.id, "is_active"], true);
      case PASSWORD_RESET_MANUAL:
        return assocIn(state, [payload.id, "password"], payload.password);
      default:
        return state;
    }
  },
});

export default Users;
