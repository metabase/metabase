import { useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery } from "metabase/api";
import { AdminContentTable } from "metabase/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import Users from "metabase/entities/users";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { Box, Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";
import type { ApiKey, Group, User as IUser, Member } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { AddMemberRow } from "../AddMemberRow";

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
  onAddUserDone: (userIds: number[]) => Promise<void>;
  onMembershipRemove: (membershipId: number) => Promise<void>;
  onMembershipUpdate: (member: Member) => void;
  reload: () => void;
  groupUsers: IUser[];
  page: number;
  pageSize: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
}

function GroupMembersTableInner({
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
    return apiKeys?.filter((apiKey) => apiKey.group.id === group.id) ?? [];
  }, [apiKeys, group.id]);

  // you can't remove people from Default and you can't remove the last user from Admin
  const isCurrentUser = ({ id }: Partial<IUser>) => id === currentUserId;
  const canRemove = (user: IUser) =>
    !isDefaultGroup(group) && !(isAdminGroup(group) && isCurrentUser(user));

  const hasMembers = group.members.length > 0;

  const handleAddUser: GroupMembersTableProps["onAddUserDone"] = async (
    userIds,
  ) => {
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
    () => new Set(groupMemberships.map((membership) => membership.user_id)),
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
        {groupUsers.map((user: IUser) => (
          <UserRow
            key={user.id}
            group={group}
            user={user}
            memberships={membershipsByUser[user.id]}
            canRemove={canRemove(user)}
            onMembershipRemove={handleRemoveUser}
            onMembershipUpdate={onMembershipUpdate}
          />
        ))}
      </AdminContentTable>
      {hasMembers && (
        <Flex align="center" justify="flex-end" p="md">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            itemsLength={groupUsers.length}
            total={groupMemberships.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        </Flex>
      )}
      {!hasMembers && (
        <Text size="lg" fw="700" ta="center" mt="4rem">
          {t`A group is only as good as its members.`}
        </Text>
      )}
    </>
  );
}

export const GroupMembersTable = Users.loadList({
  reload: true,
  pageSize: 25,
  listName: "groupUsers",
  query: (_state: State, props: GroupMembersTableProps) => ({
    group_id: props.group.id,
  }),
})(GroupMembersTableInner);

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
    (membership) => membership.group_id === group.id,
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
      <td>
        <Text fw={700}>{getName(user)}</Text>
      </td>
      {canEditMembership(group) && PLUGIN_GROUP_MANAGERS.UserTypeCell && (
        <PLUGIN_GROUP_MANAGERS.UserTypeCell
          isManager={groupMembership.is_group_manager}
          onChange={handleTypeUpdate}
          isAdmin={user.is_superuser || isAdminGroup(group)}
        />
      )}
      <td>{user.email}</td>
      {canRemove ? (
        <Box component="td" ta="right">
          <UnstyledButton
            onClick={() => onMembershipRemove(groupMembership?.membership_id)}
          >
            <Icon name="close" c="text-light" size={16} />
          </UnstyledButton>
        </Box>
      ) : null}
    </tr>
  );
};

const ApiKeyRow = ({ apiKey }: { apiKey: ApiKey }) => (
  <tr>
    <td>
      <Text fw="bold">{apiKey.name}</Text>
    </td>
    <td>
      <Text fw="bold" c="text-medium">{t`API Key`}</Text>
    </td>
    <td>{/* api keys don't have real emails */}</td>
    <Box component="td" ta="right">
      <Link to="/admin/settings/authentication/api-keys">
        <Tooltip label={t`Manage API keys`} position="left">
          <Icon name="link" c="text-light" size={16} />
        </Tooltip>
      </Link>
    </Box>
  </tr>
);

function getName(user: IUser): string {
  const name = getFullName(user);

  if (!name) {
    return "-";
  }

  return name;
}
