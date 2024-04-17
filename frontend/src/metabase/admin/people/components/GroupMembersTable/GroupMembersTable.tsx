import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery } from "metabase/api";
import AdminContentTable from "metabase/components/AdminContentTable";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import PaginationControls from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { Tooltip, Text, Icon } from "metabase/ui";
import type { ApiKey, Group, Member, User as IUser } from "metabase-types/api";
import type { State } from "metabase-types/store";

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
  const { isLoading, data: apiKeys } = useListApiKeysQuery();
  const groupApiKeys = useMemo(() => {
    return apiKeys?.filter(apiKey => apiKey.group.id === group.id) ?? [];
  }, [apiKeys, group.id]);

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

  if (isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} />;
  }

  return (
    <>
      <AdminContentTable columnTitles={columnTitles}>
        {showAddUser && (
          <AddMemberRow
            excludeIds={alreadyMembersIds}
            users={users}
            onCancel={onAddUserCancel}
            onDone={handleAddUser}
          />
        )}
        {groupApiKeys?.map((apiKey: ApiKey) => (
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
        <div className={cx(CS.flex, CS.alignCenter, CS.justifyEnd, CS.p2)}>
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
        <div className={cx(CS.mt4, CS.pt4, CS.flex, CS.layoutCentered)}>
          <h2
            className={CS.textMedium}
          >{t`A group is only as good as its members.`}</h2>
        </div>
      )}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Users.loadList({
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
      <td className={CS.textBold}>{getName(user)}</td>
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
          className={cx(CS.textRight, CS.cursorPointer)}
          onClick={() => onMembershipRemove(groupMembership?.membership_id)}
        >
          <Icon name="close" className={CS.textLight} size={16} />
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
      <td>
        <Text weight="bold">{apiKey.name}</Text>
      </td>
      <td>
        <Text weight="bold" color="text-medium">{t`API Key`}</Text>
      </td>
      <td>{/* api keys don't have real emails */}</td>
      <td className={CS.textRight}>
        <Link to="/admin/settings/authentication/api-keys">
          <Tooltip label={t`Manage API keys`} position="left">
            <Icon name="link" size={16} />
          </Tooltip>
        </Link>
      </td>
    </tr>
  );
};
