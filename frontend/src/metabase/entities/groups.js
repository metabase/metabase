import { createEntity } from "metabase/lib/entities";
import {
  CREATE_MEMBERSHIP,
  DELETE_MEMBERSHIP,
} from "metabase/admin/people/events";
import { assocIn } from "icepick";

const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",

  form: {
    fields: [{ name: "name" }],
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

    return state;
  },
});

export default Groups;
