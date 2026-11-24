import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Box,
  Flex,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { GroupInfo, IconName, User } from "metabase-types/api";

import S from "./PreviewSidebar.module.css";
import type { PreviewTarget } from "./types";

const SEARCH_DEBOUNCE_MS = 300;
const USER_LIMIT = 100;

interface PreviewSidebarProps {
  target: PreviewTarget | null;
  onSelect: (target: PreviewTarget) => void;
}

export function PreviewSidebar({ target, onSelect }: PreviewSidebarProps) {
  const [kind, setKind] = useState<PreviewTarget["kind"]>("user");
  const [search, setSearch] = useState("");

  return (
    <Flex
      component="aside"
      direction="column"
      flex="0 0 auto"
      w="18.75rem"
      style={{ borderRight: "1px solid var(--mb-color-border-neutral)" }}
    >
      <Stack gap="sm" px="xl" pt="md" pb="sm">
        <SegmentedControl
          fullWidth
          value={kind}
          onChange={(value) => {
            setKind(value === "group" ? "group" : "user");
            setSearch("");
          }}
          data={[
            { value: "user", label: t`User` },
            { value: "group", label: t`Group` },
          ]}
        />
        {kind === "group" && (
          <Text c="text-secondary">{t`Previews a stand-in member, not a real user.`}</Text>
        )}
        <TextInput
          h="2.5rem"
          leftSection={<Icon name="search" />}
          placeholder={
            kind === "user" ? t`Search for a user` : t`Search for a group`
          }
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </Stack>
      <Box flex={1} mih={0} style={{ overflowY: "auto" }}>
        {kind === "user" ? (
          <UserList search={search} target={target} onSelect={onSelect} />
        ) : (
          <GroupList search={search} target={target} onSelect={onSelect} />
        )}
      </Box>
    </Flex>
  );
}

interface ListProps {
  search: string;
  target: PreviewTarget | null;
  onSelect: (target: PreviewTarget) => void;
}

function UserList({ search, target, onSelect }: ListProps) {
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const {
    data: users,
    isLoading,
    error,
  } = useListUsersQuery({ tenancy: "all", query, limit: USER_LIMIT });
  const { data: tenants } = useListTenantsQuery({ status: "active" });

  const tenantNames = useMemo(
    () => new Map(tenants?.data.map((tenant) => [tenant.id, tenant.name])),
    [tenants],
  );

  const previewableUsers = (users?.data ?? []).filter(
    (user) => !user.is_superuser && user.is_active,
  );
  const internalUsers = previewableUsers.filter((user) => !user.tenant_id);
  const tenantUsers = previewableUsers.filter((user) => user.tenant_id);

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <>
        {previewableUsers.length === 0 && <NoResults />}
        <UserSection
          title={t`Internal users`}
          users={internalUsers}
          tenantNames={tenantNames}
          target={target}
          onSelect={onSelect}
        />
        <UserSection
          title={t`Tenant users`}
          users={tenantUsers}
          tenantNames={tenantNames}
          target={target}
          onSelect={onSelect}
        />
      </>
    </LoadingAndErrorWrapper>
  );
}

interface UserSectionProps {
  title: string;
  users: User[];
  tenantNames: Map<number, string>;
  target: PreviewTarget | null;
  onSelect: (target: PreviewTarget) => void;
}

function UserSection({
  title,
  users,
  tenantNames,
  target,
  onSelect,
}: UserSectionProps) {
  if (users.length === 0) {
    return null;
  }

  return (
    <Box pb="sm">
      <SectionTitle>{title}</SectionTitle>
      {users.map((user) => (
        <Row
          key={user.id}
          icon="person"
          name={user.common_name}
          detail={getUserDetail(user, tenantNames)}
          isSelected={target?.kind === "user" && target.user.id === user.id}
          onClick={() => onSelect({ kind: "user", user })}
        />
      ))}
    </Box>
  );
}

function getUserDetail(user: User, tenantNames: Map<number, string>) {
  const tenantName = user.tenant_id ? tenantNames.get(user.tenant_id) : null;

  return tenantName ? `${tenantName} · ${user.email}` : user.email;
}

function GroupList({ search, target, onSelect }: ListProps) {
  const { data: groups, isLoading, error } = useListPermissionsGroupsQuery({});

  const previewableGroups = (groups ?? []).filter(
    (group) =>
      group.magic_group_type !== "admin" &&
      group.magic_group_type !== "all-external-users" &&
      group.name.toLowerCase().includes(search.toLowerCase()),
  );
  const internalGroups = previewableGroups.filter(
    (group) => !group.is_tenant_group,
  );
  const tenantGroups = previewableGroups.filter(
    (group) => group.is_tenant_group,
  );

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <>
        {previewableGroups.length === 0 && <NoResults />}
        <GroupSection
          title={t`Internal groups`}
          groups={internalGroups}
          target={target}
          onSelect={onSelect}
        />
        <GroupSection
          title={t`Tenant groups`}
          groups={tenantGroups}
          target={target}
          onSelect={onSelect}
        />
      </>
    </LoadingAndErrorWrapper>
  );
}

interface GroupSectionProps {
  title: string;
  groups: GroupInfo[];
  target: PreviewTarget | null;
  onSelect: (target: PreviewTarget) => void;
}

function GroupSection({ title, groups, target, onSelect }: GroupSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <Box pb="sm">
      <SectionTitle>{title}</SectionTitle>
      {groups.map((group) => {
        const memberCount = group.member_count ?? 0;
        return (
          <Row
            key={group.id}
            icon={getGroupIcon(group)}
            name={group.name}
            rightText={ngettext(
              msgid`${memberCount} member`,
              `${memberCount} members`,
              memberCount,
            )}
            isSelected={
              target?.kind === "group" && target.group.id === group.id
            }
            onClick={() => onSelect({ kind: "group", group })}
          />
        );
      })}
    </Box>
  );
}

function getGroupIcon(group: GroupInfo): IconName {
  if (group.is_tenant_group) {
    return "globe";
  }
  return group.magic_group_type ? "bolt" : "group";
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text fw="bold" c="text-secondary" px="xl" py="sm">
      {children}
    </Text>
  );
}

function NoResults() {
  return <Text c="text-secondary" px="xl" py="md">{t`No results found`}</Text>;
}

interface RowProps {
  icon: IconName;
  name: string;
  detail?: string;
  rightText?: string;
  isSelected: boolean;
  onClick: () => void;
}

function Row({ icon, name, detail, rightText, isSelected, onClick }: RowProps) {
  return (
    <UnstyledButton
      className={isSelected ? `${S.row} ${S.selected}` : S.row}
      aria-pressed={isSelected}
      px="xl"
      py="sm"
      onClick={onClick}
    >
      <Flex gap="sm" align="center">
        <Icon name={icon} c="text-secondary" />
        <Stack gap={0} flex={1} miw={0}>
          <Text fw="bold" truncate title={name}>
            {name}
          </Text>
          {detail && (
            <Text fz="xs" c="text-secondary" truncate title={detail}>
              {detail}
            </Text>
          )}
        </Stack>
        {rightText && (
          <Text fz="xs" c="text-secondary">
            {rightText}
          </Text>
        )}
      </Flex>
    </UnstyledButton>
  );
}
