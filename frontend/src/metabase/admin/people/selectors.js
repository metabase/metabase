
import { createSelector } from 'reselect';
import _ from "underscore";

export const getGroups = (state) => state.people.groups;
export const getGroup  = (state) => state.people.group;
export const getModal  = (state) => state.people.modal;
export const getMemberships = (state) => state.people.memberships;

export const getUsers  = createSelector(
    (state) => state.people.users,
    (state) => state.people.memberships,
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
