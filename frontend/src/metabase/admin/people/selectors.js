
import { createSelector } from 'reselect';
import _ from "underscore";

export const getGroups = (state) => state.admin.people.groups;
export const getGroup  = (state) => state.admin.people.group;
export const getModal  = (state) => state.admin.people.modal;
export const getMemberships = (state) => state.admin.people.memberships;

export const getUsers  = createSelector(
    (state) => state.admin.people.users,
    (state) => state.admin.people.memberships,
    (users, memberships) =>
        users && _.mapObject(users, user => ({
            ...user,
            memberships: memberships && _.chain(memberships)
                .values()
                .filter(m => m.user_id === user.id)
                .map(m => [m.group_id, m]).object()
                .value()
        }))
)
