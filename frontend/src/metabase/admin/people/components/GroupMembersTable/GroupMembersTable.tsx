import { Fragment, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { getFullName } from "metabase/lib/user";
import { Icon } from "metabase/core/components/Icon";
import AdminContentTable from "metabase/components/AdminContentTable";
import PaginationControls from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";

import User from "metabase/entities/users";

import { ApiKeysApi } from "metabase/services";
import type { ApiKey, Group, Member, User as IUser } from "metabase-types/api";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import type { State } from "metabase-types/store";
import { isNotNull } from "metabase/lib/types";
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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  useEffect(() => {
    ApiKeysApi.list().then((apiKeys: ApiKey[]) =>
      setApiKeys(apiKeys.filter(apiKey => apiKey.group.id === group.id)),
    );
  }, [group.id]);

  // you can't remove people from Default and you can't remove the last user from Admin
  const isCurrentUser = ({ id }: Partial<IUser>) => id === currentUserId;
  const canRemove = (user: IUser) =>
    !isDefaultGroup(group) && !(isAdminGroup(group) && isCurrentUser(user));

  const hasMembers = group.members.length > 0;

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
    <Fragment>
      <AdminContentTable columnTitles={columnTitles}>
        {showAddUser && (
          <AddMemberRow
            excludeIds={alreadyMembersIds}
            users={users}
            onCancel={onAddUserCancel}
            onDone={handleAddUser}
          />
        )}
        {apiKeys.map((apiKey: ApiKey) => (
          <ApiKeyRow key={`apiKey-${apiKey.id}`} apiKey={apiKey} />
        ))}
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
    </Fragment>
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

const ApiKeyRow = ({ apiKey }: { apiKey: ApiKey }) => {
  return (
    <tr>
      <td className="text-bold">{apiKey.name}</td>
      <td></td>
      <td className="text-right">
        <Link to="/admin/settings/authentication/api-keys">
          <Tooltip
            label={t`Manage API keys on Settings \\ Authentication page`}
            position="left"
          >
            <Icon name="link" size={16} />
          </Tooltip>
        </Link>
      </td>
    </tr>
  );
};
