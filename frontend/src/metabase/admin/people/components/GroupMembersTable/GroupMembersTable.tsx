/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";

import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { getFullName } from "metabase/lib/user";
import { Icon } from "metabase/core/components/Icon";
import AdminContentTable from "metabase/components/AdminContentTable";
import PaginationControls from "metabase/components/PaginationControls";

import User from "metabase/entities/users";

import { Group, Member, User as IUser } from "metabase-types/api";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { State } from "metabase-types/store";
import { isNotNull } from "metabase/core/utils/types";
import AddMemberRow from "../AddMemberRow";

const canEditMembership = (group: Group) =>
  !isDefaultGroup(group) && PLUGIN_GROUP_MANAGERS.UserTypeCell;

interface GroupMembersTableProps {
  group: Group;
  groupMemberships: Member[];
  membershipsByUser: Record<number, Member[]>;
  currentUser: Partial<IUser>;
  users: IUser[];
  showAddUser: any;
  selectedUsers: IUser[];
  onAddUserCancel: () => void;
  onAddUserDone: (userIds: number[]) => void;
  onMembershipRemove: (membershipId: number) => void;
  onMembershipUpdate: (member: Member) => void;
  reload: () => void;
  groupUsers: IUser[];
  page: number;
  pageSize: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
}

function GroupMembersTable({
  group,
  groupMemberships,
  membershipsByUser,
  currentUser: { id: currentUserId } = {},
  users,
  showAddUser,
  onAddUserCancel,
  onAddUserDone,
  onMembershipRemove,
  onMembershipUpdate,
  groupUsers,
  page,
  pageSize,
  onNextPage,
  onPreviousPage,
  reload,
}: GroupMembersTableProps) {
  // you can't remove people from Default and you can't remove the last user from Admin
  const isCurrentUser = ({ id }: Partial<IUser>) => id === currentUserId;
  const canRemove = (user: IUser) =>
    !isDefaultGroup(group) && !(isAdminGroup(group) && isCurrentUser(user));

  const hasMembers = groupMemberships.length > 0;

  const handleAddUser: GroupMembersTableProps["onAddUserDone"] =
    async userIds => {
      await onAddUserDone(userIds);
      reload();
    };

  const handleRemoveUser = async (membershipId: number) => {
    await onMembershipRemove(membershipId);
    reload();
  };

  const columnTitles = [
    t`Name`,
    canEditMembership(group) ? t`Type` : null,
    t`Email`,
  ].filter(isNotNull);

  const alreadyMembersIds = useMemo(
    () => new Set(groupMemberships.map(membership => membership.user_id)),
    [groupMemberships],
  );

  return (
    <React.Fragment>
      <AdminContentTable columnTitles={columnTitles}>
        {showAddUser && (
          <AddMemberRow
            excludeIds={alreadyMembersIds}
            users={users}
            onCancel={onAddUserCancel}
            onDone={handleAddUser}
          />
        )}
        {groupUsers.map((user: IUser) => {
          return (
            <UserRow
              key={user.id}
              group={group}
              user={user}
              memberships={membershipsByUser[user.id]}
              canRemove={canRemove(user)}
              onMembershipRemove={handleRemoveUser}
              onMembershipUpdate={onMembershipUpdate}
            />
          );
        })}
      </AdminContentTable>
      {hasMembers && (
        <div className="flex align-center justify-end p2">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            itemsLength={groupUsers.length}
            total={groupMemberships.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        </div>
      )}
      {!hasMembers && (
        <div className="mt4 pt4 flex layout-centered">
          <h2 className="text-medium">{t`A group is only as good as its members.`}</h2>
        </div>
      )}
    </React.Fragment>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default User.loadList({
  reload: true,
  pageSize: 25,
  listName: "groupUsers",
  query: (_state: State, props: GroupMembersTableProps) => ({
    group_id: props.group.id,
  }),
})(GroupMembersTable);

interface UserRowProps {
  user: IUser;
  group: Group;
  canRemove: boolean;
  onMembershipRemove: (membershipId: number) => void;
  onMembershipUpdate: (membership: Member) => void;
  memberships: Member[];
}

const UserRow = ({
  user,
  group,
  canRemove,
  onMembershipRemove,
  onMembershipUpdate,
  memberships = [],
}: UserRowProps) => {
  const groupMembership = memberships.find(
    membership => membership.group_id === group.id,
  );

  if (!groupMembership) {
    return null;
  }

  const handleTypeUpdate = (isManager: boolean) => {
    onMembershipUpdate({
      ...groupMembership,
      is_group_manager: isManager,
    });
  };

  return (
    <tr>
      <td className="text-bold">{getName(user)}</td>
      {canEditMembership(group) && PLUGIN_GROUP_MANAGERS.UserTypeCell && (
        <PLUGIN_GROUP_MANAGERS.UserTypeCell
          isManager={groupMembership.is_group_manager}
          onChange={handleTypeUpdate}
          isAdmin={user.is_superuser || isAdminGroup(group)}
        />
      )}
      <td>{user.email}</td>
      {canRemove ? (
        <td
          className="text-right cursor-pointer"
          onClick={() => onMembershipRemove(groupMembership?.membership_id)}
        >
          <Icon name="close" className="text-light" size={16} />
        </td>
      ) : null}
    </tr>
  );
};

function getName(user: IUser): string {
  const name = getFullName(user);

  if (!name) {
    return "-";
  }

  return name;
}
