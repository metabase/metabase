import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { Link } from "metabase/common/components/Link";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { getFullName } from "metabase/lib/user";
import { PLUGIN_GROUP_MANAGERS, PLUGIN_TENANTS } from "metabase/plugins";
import { Box, Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";
import type { Group, Member, Membership } from "metabase-types/api";

import { AddMemberRow } from "../AddMemberRow";

const isApiKeyGroupMember = (member: Member) =>
  member.email.endsWith("@api-key.invalid");

const canEditMembership = (group: Group) =>
  !isDefaultGroup(group) &&
  !PLUGIN_TENANTS.isExternalUsersGroup(group) &&
  !PLUGIN_TENANTS.isTenantGroup(group) &&
  PLUGIN_GROUP_MANAGERS.UserTypeCell;

interface GroupMembersTableProps {
  group: Group;
  showAddUser: any;
  onAddUserCancel: () => void;
  onAddUserDone: (userIds: number[]) => Promise<void>;
  onMembershipRemove: (membership: Membership) => Promise<void>;
  onMembershipUpdate: (member: Member) => void;
}

export function GroupMembersTable({
  group,
  showAddUser,
  onAddUserCancel,
  onAddUserDone,
  onMembershipRemove,
  onMembershipUpdate,
}: GroupMembersTableProps) {
  const pageSize = 25;
  const { handleNextPage, handlePreviousPage, page } = usePagination();
  const offset = page * pageSize;

  const members = useMemo(() => {
    return _.partition(group.members, isApiKeyGroupMember).flat();
  }, [group.members]);
  const groupsPage = members.slice(offset, offset + pageSize);

  return (
    <>
      <AdminContentTable
        columnTitles={_.compact([
          t`Name`,
          canEditMembership(group) ? t`Type` : null,
          t`Email`,
        ])}
      >
        {showAddUser && (
          <AddMemberRow
            group={group}
            members={members}
            onCancel={onAddUserCancel}
            onDone={onAddUserDone}
          />
        )}
        {groupsPage.map((member) =>
          isApiKeyGroupMember(member) ? (
            <ApiKeyMemberRow key={member.membership_id} member={member} />
          ) : (
            <UserMemberRow
              key={member.membership_id}
              group={group}
              member={member}
              onMembershipRemove={onMembershipRemove}
              onMembershipUpdate={onMembershipUpdate}
            />
          ),
        )}
      </AdminContentTable>

      {members.length > 0 ? (
        <Flex align="center" justify="flex-end" p="md">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            itemsLength={groupsPage.length}
            total={members.length}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
          />
        </Flex>
      ) : (
        <Text size="lg" fw="700" ta="center" mt="4rem">
          {t`A group is only as good as its members.`}
        </Text>
      )}
    </>
  );
}

interface UserRowProps {
  member: Member;
  group: Group;
  onMembershipRemove: (membership: Membership) => void;
  onMembershipUpdate: (membership: Member) => void;
}

const UserMemberRow = ({
  member,
  group,
  onMembershipRemove,
  onMembershipUpdate,
}: UserRowProps) => {
  // you can't remove people from Default and you can't remove the last user from Admin
  const currentUser = checkNotNull(useSelector(getCurrentUser));
  const isCurrentUser = member.user_id === currentUser.id;
  const canRemove =
    !isDefaultGroup(group) &&
    !PLUGIN_TENANTS.isExternalUsersGroup(group) &&
    !(isAdminGroup(group) && isCurrentUser);

  const handleTypeUpdate = (isManager: boolean) => {
    onMembershipUpdate({ ...member, is_group_manager: isManager });
  };

  return (
    <tr>
      <td>
        <Text fw={700}>{getFullName(member) ?? "-"}</Text>
      </td>
      {canEditMembership(group) && PLUGIN_GROUP_MANAGERS.UserTypeCell && (
        <PLUGIN_GROUP_MANAGERS.UserTypeCell
          isManager={member.is_group_manager}
          onChange={handleTypeUpdate}
          isAdmin={member.is_superuser || isAdminGroup(group)}
        />
      )}
      <td>{member.email}</td>
      {canRemove ? (
        <Box component="td" ta="right">
          <UnstyledButton onClick={() => onMembershipRemove(member)}>
            <Icon name="close" c="text-tertiary" size={16} />
          </UnstyledButton>
        </Box>
      ) : null}
    </tr>
  );
};

const ApiKeyMemberRow = ({ member }: { member: Member }) => (
  <tr>
    <td>
      <Text fw="bold">{member.first_name}</Text>
    </td>
    <td>
      <Text fw="bold" c="text-secondary">{t`API Key`}</Text>
    </td>
    <td>{/* api keys don't have real emails */}</td>
    <Box component="td" ta="right">
      <Link to="/admin/settings/authentication/api-keys">
        <Tooltip label={t`API keys`} position="left">
          <Icon name="link" c="text-tertiary" size={16} />
        </Tooltip>
      </Link>
    </Box>
  </tr>
);
