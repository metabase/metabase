import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery, useListUsersQuery } from "metabase/api";
import AdminContentTable from "metabase/components/AdminContentTable";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { usePagination } from "metabase/hooks/use-pagination";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import { Icon, Text, Tooltip } from "metabase/ui";
import type { ApiKey, Group, User as IUser, Member } from "metabase-types/api";

import AddMemberRow from "../AddMemberRow";

const canEditMembership = (group: Group) =>
  !isDefaultGroup(group) && PLUGIN_GROUP_MANAGERS.UserTypeCell;

interface GroupMembersTableProps {
  membershipsByUser: Record<number, Member[]>;
  groupMemberships: Member[];
  group: Group;
  showAddUser: any;
  onAddUserCancel: () => void;
  onAddUserDone: (userIds: number[]) => void;
  onMembershipRemove: (membershipId: number) => void;
  onMembershipUpdate: (member: Member) => void;
}

const PAGE_SIZE = 25;
export const GroupMembersTable = ({
  groupMemberships,
  membershipsByUser,
  group,
  showAddUser,
  onAddUserCancel,
  onAddUserDone,
  onMembershipRemove,
  onMembershipUpdate,
}: GroupMembersTableProps) => {
  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const currentUser = useSelector(getUser);

  const { data: userResponse } = useListUsersQuery({
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    group_id: group.id,
  });

  const { data: users = [], total = 0 } = userResponse ?? {};

  const { isLoading, data: apiKeys } = useListApiKeysQuery();
  const groupApiKeys = useMemo(() => {
    return apiKeys?.filter(apiKey => apiKey.group.id === group.id) ?? [];
  }, [apiKeys, group.id]);

  // you can't remove people from Default and you can't remove the last user from Admin
  const isCurrentUser = ({ id }: Partial<IUser>) =>
    currentUser && id === currentUser.id;
  const canRemove = (user: IUser) =>
    !isDefaultGroup(group) && !(isAdminGroup(group) && isCurrentUser(user));

  const hasMembers = group.members.length > 0;

  const handleAddUser: GroupMembersTableProps["onAddUserDone"] =
    async userIds => {
      await onAddUserDone(userIds);
    };

  const handleRemoveUser = async (membershipId: number) => {
    await onMembershipRemove(membershipId);
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
        {users.map((user: IUser) => {
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
            pageSize={PAGE_SIZE}
            itemsLength={users.length}
            total={total}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
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
};

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
