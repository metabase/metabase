import { createSelector } from "reselect";
import _ from "underscore";

import { isMetaBotGroup } from "metabase/lib/groups";

import Group from "metabase/entities/groups";

export const getMemberships = state => state.admin.people.memberships;

export const getGroupsWithoutMetabot = createSelector(
  [Group.selectors.getList],
  groups => groups.filter(group => !isMetaBotGroup(group)),
);

export const getUsersWithMemberships = createSelector(
  [state => state.entities.users, getMemberships],
  (users, memberships) =>
    users &&
    _.mapObject(users, user => ({
      ...user,
      memberships:
        memberships &&
        _.chain(memberships)
          .values()
          .filter(m => m.user_id === user.id)
          .map(m => [m.group_id, m])
          .object()
          .value(),
    })),
);

// sort the users list by last_name, ignore case or diacritical marks. If last names are the same then compare by first
// name
const compareNames = (a, b) =>
  a.localeCompare(b, undefined, { sensitivty: "base" });

export const getSortedUsersWithMemberships = createSelector(
  [getUsersWithMemberships],
  users =>
    users &&
    _.values(users).sort(
      (a, b) =>
        compareNames(a.last_name, b.last_name) ||
        compareNames(a.first_name, b.first_name),
    ),
);

export const getUserTemporaryPassword = (state, props) =>
  state.admin.people.temporaryPasswords[props.userId];
