import { skipToken } from "@reduxjs/toolkit/query";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { AdminContentTable } from "metabase/admin/components/AdminContentTable";
import { AdminPaneLayout } from "metabase/admin/components/AdminPaneLayout";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { userToColor } from "metabase/admin/people/colors";
import { getDatabaseFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import {
  useCreateMembershipMutation,
  useDeleteMembershipMutation,
  useGetPermissionsGroupQuery,
  useListUsersQuery,
} from "metabase/api";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { Link, useParams } from "metabase/router";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Flex,
  HoverCard,
  Icon,
  Input,
  Pill,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { getFullName } from "metabase/utils/user";
import {
  useGetDataAppQuery,
  useGetDataAppUserPermissionWarningsQuery,
} from "metabase-enterprise/api";
import type {
  DataAppUserPermissionWarning,
  Group,
  Member,
  User,
} from "metabase-types/api";

import S from "./ManageDataAppUsersPage.module.css";

const PAGE_SIZE = 25;
const MAX_PENDING_USERS = 100;

type DataAppAddRowProps = {
  value: string;
  isValid: boolean;
  hasCurrentUsers: boolean;
  placeholder: string;
  ariaLabel: string;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDone: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

const DataAppAddRow = ({
  value,
  isValid,
  hasCurrentUsers,
  placeholder,
  ariaLabel,
  onPaste,
  onChange,
  onDone,
  onCancel,
  children,
}: DataAppAddRowProps) => (
  <Flex
    p="0.5rem"
    align="center"
    bd="1px solid var(--mb-color-core-brand)"
    style={{
      borderRadius: hasCurrentUsers ? "0.5rem 0.5rem 0 0" : "0.5rem",
      borderBottomWidth: hasCurrentUsers ? 0 : undefined,
    }}
  >
    {children}
    <Input
      type="text"
      variant="unstyled"
      flex="1 0 auto"
      fz="lg"
      styles={{ input: { background: "transparent" } }}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus
      onPaste={onPaste}
      onChange={onChange}
    />
    <Button variant="subtle" bg="transparent" onClick={onCancel} mr="sm">
      {t`Cancel`}
    </Button>
    <Button
      variant={isValid ? "filled" : "outline"}
      disabled={!isValid}
      onClick={onDone}
    >
      {t`Add`}
    </Button>
  </Flex>
);

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
    <Stack gap="xl">
      <Box px="md">
        <Breadcrumbs
          crumbs={[[t`Data apps`, "/admin/settings/apps"], [appTitle]]}
          size="large"
        />
      </Box>

      <AdminPaneLayout
        title={
          <Text component="span" fz="2rem" lh="2rem">
            {t`Manage access to this app`}
          </Text>
        }
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

          {members.length === 0
            ? !isAdding && (
                <Box
                  data-testid="data-app-users-empty-state"
                  bg="background-secondary"
                  bdrs="md"
                  py="5rem"
                >
                  <EmptyState
                    title={t`No one has access yet`}
                    illustrationElement={
                      <img
                        src={NoResults}
                        alt=""
                        width={120}
                        height={120}
                        data-testid="data-app-users-empty-state-icon"
                      />
                    }
                    spacing="sm"
                  />
                </Box>
              )
            : null}

          {(isAdding || members.length > 0) && (
            <Box
              data-testid="data-app-users-card"
              bd={members.length > 0 ? "1px solid var(--mb-color-border)" : 0}
              bdrs="md"
              bg="background-primary"
              style={{ overflow: "hidden" }}
            >
              {isAdding && (
                <AddUsersSection
                  hasCurrentUsers={members.length > 0}
                  members={members}
                  selectedUsers={selectedUsers}
                  onSelectedUsersChange={setSelectedUsers}
                  onCancel={() => {
                    setSelectedUsers(new Map());
                    setIsAdding(false);
                  }}
                  onDone={handleAddUsers}
                />
              )}

              {members.length > 0 && (
                <AdminContentTable className={S.userTable} columnTitles={[]}>
                  {visibleMembers.map((member) => (
                    <MemberRow
                      key={member.membership_id}
                      member={member}
                      warning={memberWarnings.byUserId.get(member.user_id)}
                      onRemove={handleRemoveUser}
                    />
                  ))}
                </AdminContentTable>
              )}

              {members.length > PAGE_SIZE && (
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
              )}
            </Box>
          )}
        </Stack>
      </AdminPaneLayout>
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
  };
};

const MemberRow = ({
  member,
  warning,
  onRemove,
}: {
  member: Member;
  warning?: DataAppUserPermissionWarning;
  onRemove: (member: Member) => void;
}) => {
  const name = getFullName(member) ?? member.email;

  return (
    <tr>
      <td>
        <Text fw={700}>{name}</Text>
      </td>
      <td>{member.email}</td>
      <Box component="td" w="1%" style={{ whiteSpace: "nowrap" }}>
        <Flex
          data-testid="data-app-user-actions"
          align="center"
          justify="flex-end"
          gap="lg"
          wrap="nowrap"
          style={{ minWidth: "max-content" }}
        >
          {warning && (
            <DataAccessWarning
              warning={warning}
              userName={member.first_name || name}
            />
          )}
          <UnstyledButton
            aria-label={t`Remove ${name}`}
            onClick={() => onRemove(member)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" c="text-disabled" size={16} />
          </UnstyledButton>
        </Flex>
      </Box>
    </tr>
  );
};

const AddUsersSection = ({
  hasCurrentUsers,
  members,
  selectedUsers,
  onSelectedUsersChange,
  onCancel,
  onDone,
}: {
  hasCurrentUsers: boolean;
  members: Member[];
  selectedUsers: Map<number, User>;
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
        ((user.common_name ?? "").toLowerCase().includes(input) ||
          user.email.toLowerCase().includes(input)),
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

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const emails = event.clipboardData
      .getData("text")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (emails.length < 2) {
      return;
    }

    const usersByEmail = new Map(
      (data?.data ?? []).map((user) => [user.email.toLowerCase(), user]),
    );
    const nextUsers = new Map(selectedUsers);
    const unmatchedEmails: string[] = [];

    for (const email of emails) {
      const user = usersByEmail.get(email.toLowerCase());
      const canAdd =
        user?.is_active &&
        user.tenant_id == null &&
        !memberIds.has(user.id) &&
        nextUsers.size < MAX_PENDING_USERS;

      if (user && canAdd) {
        nextUsers.set(user.id, user);
      } else {
        unmatchedEmails.push(email);
      }
    }

    if (nextUsers.size > selectedUsers.size) {
      event.preventDefault();
      onSelectedUsersChange(nextUsers);
      setText(unmatchedEmails.join(", "));
      setIsPickerOpen(false);
    }
  };

  const removeUser = (user: User) => {
    const nextUsers = new Map(selectedUsers);
    nextUsers.delete(user.id);
    onSelectedUsersChange(nextUsers);
  };

  return (
    <Popover
      opened={isPickerOpen && !isLoading && !error && suggestedUsers.length > 0}
      onChange={setIsPickerOpen}
      position="bottom-start"
      shadow="md"
    >
      <Popover.Target>
        <Box
          mx={hasCurrentUsers ? "-1px" : 0}
          mt={hasCurrentUsers ? "-1px" : 0}
        >
          <DataAppAddRow
            value={text}
            isValid={selectedUsers.size > 0}
            hasCurrentUsers={hasCurrentUsers}
            placeholder={t`Pick someone from the list, or paste a list of email addresses separated by commas`}
            ariaLabel={t`Search for a user to add`}
            onChange={(event) => {
              setText(event.target.value);
              setIsPickerOpen(true);
            }}
            onPaste={handlePaste}
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
          </DataAppAddRow>
        </Box>
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
  );
};

const DataAccessWarning = ({
  warning,
  userName,
}: {
  warning: DataAppUserPermissionWarning;
  userName: string;
}) => {
  const label = t`Missing data access`;

  return (
    <HoverCard
      position="bottom-end"
      openDelay={150}
      closeDelay={100}
      shadow="md"
    >
      <HoverCard.Target>
        <UnstyledButton
          className={S.dataAccessWarningButton}
          aria-label={label}
          style={{ flexShrink: 0 }}
        >
          <Badge
            className={S.dataAccessWarningBadge}
            size="sm"
            c="text-primary"
            bdrs="sm"
            tt="none"
          >
            {label}
          </Badge>
        </UnstyledButton>
      </HoverCard.Target>

      <HoverCard.Dropdown
        data-testid="data-access-warning-popover"
        p="lg"
        w="30rem"
      >
        <Stack gap="lg">
          <Text size="sm">
            {t`${userName} doesn’t have permission to view these tables used in this app:`}
          </Text>

          <Stack
            component="ul"
            data-testid="missing-tables-list"
            gap="sm"
            m={0}
            pl={0}
            style={{ listStyle: "none" }}
          >
            {warning.missing_tables.map((table) => {
              const parts = [
                {
                  label: table.database_name,
                  url: getDatabaseFocusPermissionsUrl({
                    databaseId: table.database_id,
                  }),
                },
                ...(table.schema
                  ? [
                      {
                        label: table.schema,
                        url: getDatabaseFocusPermissionsUrl({
                          databaseId: table.database_id,
                          schemaName: table.schema,
                        }),
                      },
                    ]
                  : []),
                {
                  label: table.name,
                  url: getDatabaseFocusPermissionsUrl({
                    databaseId: table.database_id,
                    schemaName: table.schema ?? undefined,
                    tableId: table.id,
                  }),
                },
              ];

              return (
                <Flex
                  component="li"
                  key={table.id}
                  align="center"
                  gap={4}
                  wrap="wrap"
                >
                  {parts.map((part, index) => (
                    <Flex key={part.url} align="center" gap={4}>
                      <Anchor
                        component={Link}
                        to={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        fw={700}
                      >
                        {part.label}
                      </Anchor>
                      {index < parts.length - 1 && (
                        <Icon
                          name="chevronright"
                          size={12}
                          c="text-secondary"
                          aria-hidden
                        />
                      )}
                    </Flex>
                  ))}
                </Flex>
              );
            })}
          </Stack>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const WarningRequestError = () => (
  <Alert color="warning" icon={<Icon name="warning" />}>
    {t`We couldn't check data access for some users. You can still update access to this data app.`}
  </Alert>
);
