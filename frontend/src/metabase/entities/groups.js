import { assocIn } from "icepick";

import { createEntity } from "metabase/lib/entities";
import {
  CREATE_MEMBERSHIP,
  DELETE_MEMBERSHIP,
  CLEAR_MEMBERSHIPS,
} from "metabase/admin/people/events";
import { PermissionsApi } from "metabase/services";

const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",

  form: {
    fields: [{ name: "name" }],
  },

  actions: {
    clearMember: async ({ id }) => {
      await PermissionsApi.clearGroupMembership({ id });

      return { type: CLEAR_MEMBERSHIPS, payload: { groupId: id } };
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === CREATE_MEMBERSHIP && !error) {
      const { membership, group_id } = payload;
      const members = state[group_id]?.members;
      if (members) {
        members.push(membership);
        return assocIn(state, [group_id, "members"], members);
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
