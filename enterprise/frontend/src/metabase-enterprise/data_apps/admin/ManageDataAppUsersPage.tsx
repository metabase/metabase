import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { AdminContentTable } from "metabase/admin/components/AdminContentTable";
import { AdminPaneLayout } from "metabase/admin/components/AdminPaneLayout";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { userToColor } from "metabase/admin/people/colors";
import { AddRow } from "metabase/admin/people/components/AddRow";
import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useGetPermissionsGroupQuery,
  useListUsersQuery,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { useParams } from "metabase/router";
import {
  Alert,
  Box,
  Button,
  Flex,
  HoverCard,
  Icon,
  Pill,
  Popover,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { getFullName } from "metabase/utils/user";
import {
  useGetDataAppQuery,
  useGetDataAppUserPermissionWarningsQuery,
} from "metabase-enterprise/api";
import type {
  DataAppMissingTable,
  DataAppUserPermissionWarning,
  Group,
  Member,
  User,
} from "metabase-types/api";

const PAGE_SIZE = 25;
const MAX_PENDING_USERS = 100;

export const ManageDataAppUsersPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const appRequest = useGetDataAppQuery(slug);
  const groupRequest = useGetPermissionsGroupQuery(
    appRequest.data?.permission_group_id ?? skipToken,
  );

  const error = appRequest.error ?? groupRequest.error;
  const isLoading = appRequest.isLoading || groupRequest.isLoading;

  return (
    <SettingsPageWrapper>
      <LoadingAndErrorWrapper error={error} loading={isLoading}>
        {appRequest.data && groupRequest.data && (
          <DataAppUsers
            appName={slug}
            appTitle={appRequest.data.display_name}
            group={groupRequest.data}
          />
        )}
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
};

const DataAppUsers = ({
  appName,
  appTitle,
  group,
}: {
  appName: string;
  appTitle: string;
  group: Group;
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Map<number, User>>(
    new Map(),
  );
  const [createMembership] = useCreateMembershipMutation();
  const [deleteMembership] = useDeleteMembershipMutation();
  const [sendToast] = useToast();
  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const members = useMemo(
    () =>
      group.members.filter(({ email }) => !email.endsWith("@api-key.invalid")),
    [group.members],
  );
  const visibleMembers = useMemo(
    () => members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [members, page],
  );
  const visibleMemberIds = useMemo(
    () => visibleMembers.map(({ user_id }) => user_id),
    [visibleMembers],
  );
  const selectedUserIds = useMemo(
    () => Array.from(selectedUsers.keys()),
    [selectedUsers],
  );
  const memberWarnings = useWarnings(appName, visibleMemberIds);
  const selectedWarnings = useWarnings(appName, selectedUserIds);

  const handleAddUsers = async () => {
    try {
      await Promise.all(
        selectedUserIds.map((userId) =>
          createMembership({ group_id: group.id, user_id: userId }).unwrap(),
        ),
      );
      setSelectedUsers(new Map());
      setIsAdding(false);
    } catch {
      sendToast({ message: t`Failed to add users`, icon: "warning" });
    }
  };

  const handleRemoveUser = async (member: Member) => {
    const { error } = await deleteMembership(member);
    if (error) {
      sendToast({ message: t`Failed to remove user`, icon: "warning" });
    }
  };

  return (
    <Stack gap="md">
      <Link to="/admin/settings/apps">
        <Flex align="center" gap="xs">
          <Icon name="chevronleft" size={14} />
          <Text>{t`Data apps`}</Text>
        </Flex>
      </Link>

      <SettingsSection data-testid="data-app-users-card">
        <AdminPaneLayout
          title={t`Manage users for ${appTitle}`}
          description={ngettext(
            msgid`${members.length} user`,
            `${members.length} users`,
            members.length,
          )}
          titleActions={
            <Button
              variant="filled"
              onClick={() => setIsAdding(true)}
              disabled={isAdding}
            >
              {t`Add users`}
            </Button>
          }
        >
          <Stack data-testid="user-management-sections" gap="lg">
            {memberWarnings.isError && <WarningRequestError />}

            {isAdding && (
              <AddUsersSection
                members={members}
                selectedUsers={selectedUsers}
                warnings={selectedWarnings.byUserId}
                warningsFailed={selectedWarnings.isError}
                onSelectedUsersChange={setSelectedUsers}
                onCancel={() => {
                  setSelectedUsers(new Map());
                  setIsAdding(false);
                }}
                onDone={handleAddUsers}
              />
            )}

            {members.length === 0 ? (
              !isAdding && (
                <Text c="text-secondary" ta="center" mt="xl">
                  {t`Add users to give them access to this data app.`}
                </Text>
              )
            ) : (
              <Stack gap="sm">
                <Text fw={700}>{t`Current users`}</Text>

                <AdminContentTable
                  columnTitles={[t`Name`, t`Email`, t`Data access`]}
                >
                  {visibleMembers.map((member) => (
                    <MemberRow
                      key={member.membership_id}
                      member={member}
                      isAccessChecked={memberWarnings.isSuccess}
                      warning={memberWarnings.byUserId.get(member.user_id)}
                      onRemove={handleRemoveUser}
                    />
                  ))}
                </AdminContentTable>

                <Flex align="center" justify="flex-end" p="md">
                  <PaginationControls
                    page={page}
                    pageSize={PAGE_SIZE}
                    itemsLength={visibleMembers.length}
                    total={members.length}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                  />
                </Flex>
              </Stack>
            )}
          </Stack>
        </AdminPaneLayout>
      </SettingsSection>
    </Stack>
  );
};

const useWarnings = (appName: string, userIds: number[]) => {
  const request = useGetDataAppUserPermissionWarningsQuery(
    userIds.length > 0 ? { name: appName, user_ids: userIds } : skipToken,
  );
  const byUserId = useMemo(
    () =>
      new Map(request.data?.map((warning) => [warning.user_id, warning]) ?? []),
    [request.data],
  );

  return {
    byUserId,
    isError: request.isError,
    isSuccess: request.isSuccess,
  };
};

const MemberRow = ({
  member,
  isAccessChecked,
  warning,
  onRemove,
}: {
  member: Member;
  isAccessChecked: boolean;
  warning?: DataAppUserPermissionWarning;
  onRemove: (member: Member) => void;
}) => {
  const name = getFullName(member) ?? member.email;
  const adequateAccessLabel = t`Has view or sandboxed access to every table used by this app.`;

  return (
    <tr>
      <td>
        <Text fw={700}>{name}</Text>
      </td>
      <td>{member.email}</td>
      <td>
        {warning ? (
          <DataAccessWarning warning={warning} />
        ) : (
          isAccessChecked && (
            <Tooltip label={adequateAccessLabel}>
              <Icon
                name="check"
                c="feedback-positive"
                aria-label={adequateAccessLabel}
              />
            </Tooltip>
          )
        )}
      </td>
      <Box component="td" ta="right">
        <UnstyledButton
          aria-label={t`Remove ${name}`}
          onClick={() => onRemove(member)}
        >
          <Icon name="close" c="text-disabled" size={16} />
        </UnstyledButton>
      </Box>
    </tr>
  );
};

const AddUsersSection = ({
  members,
  selectedUsers,
  warnings,
  warningsFailed,
  onSelectedUsersChange,
  onCancel,
  onDone,
}: {
  members: Member[];
  selectedUsers: Map<number, User>;
  warnings: Map<number, DataAppUserPermissionWarning>;
  warningsFailed: boolean;
  onSelectedUsersChange: (users: Map<number, User>) => void;
  onCancel: () => void;
  onDone: () => void;
}) => {
  const { data, error, isLoading } = useListUsersQuery({
    tenancy: "internal",
  });
  const [text, setText] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(true);
  const memberIds = useMemo(
    () => new Set(members.map(({ user_id }) => user_id)),
    [members],
  );
  const suggestedUsers = useMemo(() => {
    const input = text.toLowerCase();
    return (data?.data ?? []).filter(
      (user) =>
        user.is_active &&
        user.tenant_id == null &&
        !memberIds.has(user.id) &&
        !selectedUsers.has(user.id) &&
        (user.common_name ?? "").toLowerCase().includes(input),
    );
  }, [data, memberIds, selectedUsers, text]);

  const addUser = (user: User) => {
    if (selectedUsers.size >= MAX_PENDING_USERS) {
      return;
    }
    onSelectedUsersChange(new Map(selectedUsers).set(user.id, user));
    setText("");
    setIsPickerOpen(false);
  };

  const removeUser = (user: User) => {
    const nextUsers = new Map(selectedUsers);
    nextUsers.delete(user.id);
    onSelectedUsersChange(nextUsers);
  };
  const usersMissingDataAccess = Array.from(selectedUsers.values()).flatMap(
    (user) => {
      const warning = warnings.get(user.id);
      return warning ? [{ user, warning }] : [];
    },
  );

  return (
    <Stack gap="sm">
      <Popover
        opened={
          isPickerOpen && !isLoading && !error && suggestedUsers.length > 0
        }
        onChange={setIsPickerOpen}
        position="bottom-start"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <div>
            <AddRow
              value={text}
              isValid={selectedUsers.size > 0}
              placeholder={t`Julie McMemberson`}
              ariaLabel={t`Search for a user to add`}
              submitLabel={t`Save`}
              onChange={(event) => {
                setText(event.target.value);
                setIsPickerOpen(true);
              }}
              onDone={onDone}
              onCancel={onCancel}
            >
              {Array.from(selectedUsers.values()).map((user, index) => (
                <Pill
                  key={user.id}
                  size="md"
                  ms={index > 0 ? "sm" : ""}
                  withRemoveButton
                  onRemove={() => removeUser(user)}
                >
                  {user.common_name}
                </Pill>
              ))}
            </AddRow>
          </div>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap={0} miw="15rem">
            {suggestedUsers.map((user) => (
              <Flex
                key={user.id}
                component={UnstyledButton}
                align="center"
                gap="md"
                p="0.5rem 1rem"
                onClick={() => addUser(user)}
              >
                <UserAvatar bg={userToColor(user)} user={user} />
                <Text fw="bold" size="lg">
                  {user.common_name}
                </Text>
              </Flex>
            ))}
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {warningsFailed && <WarningRequestError />}

      {usersMissingDataAccess.length > 0 && (
        <Box
          data-testid="missing-data-access-users"
          bg="background-secondary"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          p="md"
        >
          <Flex align="center" justify="space-between" gap="md" mb="sm">
            <Flex align="baseline" gap="xs">
              <Text fw={700}>{t`Users missing data access`}</Text>
              <Text c="text-secondary" size="sm">
                {usersMissingDataAccess.length}
              </Text>
            </Flex>
            <Text c="text-secondary" size="sm">
              {t`These users might not see all data in this app.`}
            </Text>
          </Flex>

          <Stack gap="xs">
            {usersMissingDataAccess.map(({ user, warning }) => (
              <Flex
                key={user.id}
                align="center"
                justify="space-between"
                gap="lg"
                bg="background-primary"
                bdrs="sm"
                px="md"
                py="sm"
              >
                <Flex align="center" gap="sm" miw={0}>
                  <UserAvatar bg={userToColor(user)} user={user} />
                  <Stack gap={0} miw={0}>
                    <Text fw={700} truncate>
                      {user.common_name}
                    </Text>
                    <Text c="text-secondary" size="sm" truncate>
                      {user.email}
                    </Text>
                  </Stack>
                </Flex>

                <DataAccessWarning warning={warning} />
              </Flex>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};

const DataAccessWarning = ({
  warning,
}: {
  warning: DataAppUserPermissionWarning;
}) => {
  const label = ngettext(
    msgid`Missing access to ${warning.missing_tables.length} table`,
    `Missing access to ${warning.missing_tables.length} tables`,
    warning.missing_tables.length,
  );
  const duplicateNames = useMemo(() => {
    const counts = warning.missing_tables.reduce<Record<string, number>>(
      (result, table) => ({
        ...result,
        [table.name]: (result[table.name] ?? 0) + 1,
      }),
      {},
    );
    return new Set(
      Object.entries(counts)
        .filter(([, count]) => count > 1)
        .map(([name]) => name),
    );
  }, [warning.missing_tables]);

  return (
    <HoverCard
      position="bottom-start"
      openDelay={150}
      closeDelay={100}
      withArrow
      shadow="md"
    >
      <HoverCard.Target>
        <UnstyledButton aria-label={label}>
          <Flex align="center" gap="xs" c="warning">
            <Icon name="warning" />
            <Text c="inherit">{label}</Text>
          </Flex>
        </UnstyledButton>
      </HoverCard.Target>

      <HoverCard.Dropdown
        data-testid="data-access-warning-popover"
        p="md"
        w="22rem"
      >
        <Stack gap="md">
          <Stack gap="xs">
            <Text fw={700}>{t`Missing data access`}</Text>
            <Text c="text-secondary" size="sm">
              {t`This user might not see all data in this app.`}
            </Text>
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">{t`Tables without access`}</Text>
            <Stack
              component="ul"
              data-testid="missing-tables-list"
              gap={4}
              m={0}
              pl={0}
              style={{ listStyle: "none" }}
            >
              {warning.missing_tables.map((table) => (
                <Flex component="li" key={table.id} align="center" gap="xs">
                  <Icon
                    name="table"
                    c="text-secondary"
                    size={14}
                    aria-hidden
                    data-testid="missing-table-icon"
                  />
                  <Text size="sm">{tableLabel(table, duplicateNames)}</Text>
                </Flex>
              ))}
            </Stack>
          </Stack>

          <Button
            component={Link}
            to="/admin/permissions/data/group"
            variant="outline"
            size="compact-sm"
            w="fit-content"
            rightSection={<Icon name="chevronright" size={12} aria-hidden />}
          >
            {t`Review data permissions`}
          </Button>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const tableLabel = (
  table: DataAppMissingTable,
  duplicateNames: Set<string>,
) => {
  if (!duplicateNames.has(table.name)) {
    return table.name;
  }
  return [table.database_name, table.schema, table.name]
    .filter(Boolean)
    .join(" > ");
};

const WarningRequestError = () => (
  <Alert color="warning" icon={<Icon name="warning" />}>
    {t`We couldn't check data access for some users. You can still update access to this data app.`}
  </Alert>
);
