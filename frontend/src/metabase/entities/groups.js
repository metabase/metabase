import { assocIn } from "icepick";

import {
  CREATE_MEMBERSHIP,
  DELETE_MEMBERSHIP,
  CLEAR_MEMBERSHIPS,
} from "metabase/admin/people/events";
import { permissionApi } from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

/**
 * @deprecated use "metabase/api" instead
 */
const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        permissionApi.endpoints.listPermissionsGroups,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        permissionApi.endpoints.getPermissionsGroup,
      ),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        permissionApi.endpoints.createPermissionsGroup,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        permissionApi.endpoints.updatePermissionsGroup,
      ),
    delete: ({ id }, dispatch) =>
      entityCompatibleQuery(
        id,
        dispatch,
        permissionApi.endpoints.deletePermissionsGroup,
      ),
  },

  actions: {
    clearMember:
      async ({ id }) =>
      async dispatch => {
        await dispatch(
          entityCompatibleQuery(
            id,
            dispatch,
            permissionApi.endpoints.clearGroupMembership,
          ),
        );
        dispatch({ type: CLEAR_MEMBERSHIPS, payload: { groupId: id } });
      },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === CREATE_MEMBERSHIP && !error) {
      const { membership, group_id } = payload;
      const members = state[group_id]?.members;
      if (members) {
        const updatedMembers = [...members, membership];
        return assocIn(state, [group_id, "members"], updatedMembers);
      } else {
        return state;
      }
    }

    if (type === DELETE_MEMBERSHIP && !error) {
      const { membershipId, groupId } = payload;
      const members = state[groupId]?.members;
      if (members) {
        return assocIn(
          state,
          [groupId, "members"],
          members.filter(m => m.membership_id !== membershipId),
        );
      } else {
        return state;
      }
    }

    if (type === CLEAR_MEMBERSHIPS && !error) {
      const { groupId } = payload;
      return assocIn(state, [groupId, "members"], []);
    }

    return state;
  },
});

export default Groups;
