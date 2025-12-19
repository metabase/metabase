import { assocIn } from "icepick";

import { CLEAR_MEMBERSHIPS } from "metabase/admin/people/events";
import {
  permissionApi,
  useGetPermissionsGroupQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

/**
 * @deprecated use "metabase/api" instead
 */
export const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListPermissionsGroupsQuery,
  },

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
      ({ id }) =>
      async (dispatch) => {
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
    if (type === CLEAR_MEMBERSHIPS && !error) {
      const { groupId } = payload;
      return assocIn(state, [groupId, "members"], []);
    }

    return state;
  },
});

const useGetQuery = ({ id }) => {
  return useGetPermissionsGroupQuery(id);
};
