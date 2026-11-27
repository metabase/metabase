import { type KeyboardEvent, forwardRef, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Tree } from "metabase/common/components/tree";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useSetting } from "metabase/settings";
import {
  Box,
  Flex,
  Icon,
  Input,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { GroupInfo, User } from "metabase-types/api";

import S from "./PreviewSidebar.module.css";
import type { PreviewTarget } from "./types";

const SEARCH_DEBOUNCE_MS = 300;
const USER_LIMIT = 100;

interface RowData {
  detail?: string;
  rightText?: string;
  isTabStop: boolean;
  target: PreviewTarget;
}

type RowItem = ITreeNodeItem<RowData>;

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
      <Stack gap="sm" pt="md" px="xl" flex="0 0 auto">
        <SegmentedControl
          fullWidth
          aria-label={t`Preview as`}
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
          <Text
            fz="sm"
            c="text-secondary"
          >{t`Previews a stand-in member, not a real user.`}</Text>
        )}
      </Stack>
      <TextInput
        size="lg"
        py="md"
        px="xl"
        flex="0 0 auto"
        aria-label={
          kind === "user" ? t`Search for a user` : t`Search for a group`
        }
        placeholder={
          kind === "user" ? t`Search for a user` : t`Search for a group`
        }
        leftSection={<Icon name="search" />}
        rightSectionPointerEvents="all"
        rightSection={
          search.length > 0 ? (
            <Input.ClearButton
              c="text-secondary"
              onClick={() => setSearch("")}
            />
          ) : null
        }
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <Box
        flex={1}
        mih={0}
        style={{ overflowY: "auto" }}
        onKeyDown={moveBetweenRows}
      >
        {kind === "user" ? (
          <UserList search={search} target={target} onSelect={onSelect} />
        ) : (
          <GroupList search={search} target={target} onSelect={onSelect} />
        )}
      </Box>
    </Flex>
  );
}

// the rows are one Tab stop for the whole list; the arrow keys move between them
function moveBetweenRows(event: KeyboardEvent<HTMLElement>) {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (step === 0) {
    return;
  }
  event.preventDefault();
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  const current = rows.findIndex((row) => row === event.target);
  rows[current + step]?.focus();
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
  const hasTenants = useSetting("use-tenants");

  const tenantNames = useMemo(
    () => new Map(tenants?.data.map((tenant) => [tenant.id, tenant.name])),
    [tenants],
  );

  const previewableUsers = (users?.data ?? []).filter(
    (user) => !user.is_superuser && user.is_active,
  );
  const internalUsers = previewableUsers
    .filter((user) => !user.tenant_id)
    .sort((a, b) => a.common_name.localeCompare(b.common_name));
  const tenantUsers = previewableUsers
    .filter((user) => user.tenant_id)
    .sort(
      (a, b) =>
        getTenantName(a, tenantNames).localeCompare(
          getTenantName(b, tenantNames),
        ) || a.common_name.localeCompare(b.common_name),
    );

  const selectedId = target?.kind === "user" ? target.user.id : undefined;
  const tabStopId = selectedId ?? [...internalUsers, ...tenantUsers][0]?.id;

  if (error) {
    return <Message>{t`Couldn't load who can be previewed`}</Message>;
  }
  if (isLoading) {
    return null;
  }
  if (previewableUsers.length === 0) {
    return <NoResults />;
  }

  function getItems(sectionUsers: User[]): RowItem[] {
    return sectionUsers.map((user) => ({
      id: user.id,
      name: user.common_name,
      icon: "person",
      data: {
        detail: getUserDetail(user, tenantNames),
        isTabStop: user.id === tabStopId,
        target: { kind: "user", user },
      },
    }));
  }

  return (
    <>
      <Section
        title={hasTenants ? t`Internal users` : null}
        items={getItems(internalUsers)}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <Section
        title={hasTenants ? t`Tenant users` : null}
        items={getItems(tenantUsers)}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </>
  );
}

function getTenantName(user: User, tenantNames: Map<number, string>) {
  return (user.tenant_id && tenantNames.get(user.tenant_id)) || "";
}

function getUserDetail(user: User, tenantNames: Map<number, string>) {
  const tenantName = getTenantName(user, tenantNames);

  return tenantName ? `${tenantName} · ${user.email}` : user.email;
}

function GroupList({ search, target, onSelect }: ListProps) {
  const { data: groups, isLoading, error } = useListPermissionsGroupsQuery({});
  const hasTenants = useSetting("use-tenants");

  const previewableGroups = (groups ?? [])
    .filter(
      (group) =>
        group.magic_group_type !== "admin" &&
        group.magic_group_type !== "all-external-users" &&
        group.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.magic_group_type)) -
          Number(Boolean(a.magic_group_type)) || a.name.localeCompare(b.name),
    );
  const internalGroups = previewableGroups.filter(
    (group) => !group.is_tenant_group,
  );
  const tenantGroups = previewableGroups.filter(
    (group) => group.is_tenant_group,
  );

  const selectedId = target?.kind === "group" ? target.group.id : undefined;
  const tabStopId = selectedId ?? [...internalGroups, ...tenantGroups][0]?.id;

  if (error) {
    return <Message>{t`Couldn't load who can be previewed`}</Message>;
  }
  if (isLoading) {
    return null;
  }
  if (previewableGroups.length === 0) {
    return <NoResults />;
  }

  function getItems(sectionGroups: GroupInfo[]): RowItem[] {
    return sectionGroups.map((group) => {
      const memberCount = group.member_count ?? 0;

      return {
        id: group.id,
        name: group.name,
        icon: group.is_tenant_group
          ? "globe"
          : group.magic_group_type
            ? "bolt"
            : "group",
        data: {
          rightText: ngettext(
            msgid`${memberCount} member`,
            `${memberCount} members`,
            memberCount,
          ),
          isTabStop: group.id === tabStopId,
          target: { kind: "group", group },
        },
      };
    });
  }

  return (
    <>
      <Section
        title={hasTenants ? t`Internal groups` : null}
        items={getItems(internalGroups)}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <Section
        title={hasTenants ? t`Tenant groups` : null}
        items={getItems(tenantGroups)}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </>
  );
}

interface SectionProps {
  title: string | null;
  items: RowItem[];
  selectedId?: number;
  onSelect: (target: PreviewTarget) => void;
}

function Section({ title, items, selectedId, onSelect }: SectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {title && (
        <Text fw="bold" c="text-secondary" px="xl" pt="md" pb="xs">
          {title}
        </Text>
      )}
      <Tree
        data={items}
        selectedId={selectedId}
        TreeNode={PreviewTreeNode}
        rightSection={(item: RowItem) =>
          item.data?.rightText && (
            <Text
              fz="sm"
              fw="normal"
              lh="normal"
              pl="sm"
              opacity={0.7}
              c="inherit"
            >
              {item.data.rightText}
            </Text>
          )
        }
        onSelect={(item: RowItem) => item.data && onSelect(item.data.target)}
      />
    </>
  );
}

const PreviewTreeNode = forwardRef<HTMLLIElement, TreeNodeProps<RowData>>(
  function PreviewTreeNode(
    { item, depth, isSelected, rightSection, onSelect },
    ref,
  ) {
    const Node = Tree.Node;
    const className = isSelected ? `${S.row} ${S.selected}` : S.row;

    return (
      <Node.Root
        ref={ref}
        role="menuitem"
        aria-label={item.name}
        aria-current={isSelected}
        tabIndex={item.data?.isTabStop ? 0 : -1}
        className={className}
        depth={depth}
        isSelected={isSelected}
        onClick={onSelect}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.();
          }
        }}
      >
        <Node.ExpandToggleButton hidden>
          <Node.ExpandToggleIcon
            isExpanded={false}
            name="chevronright"
            size={12}
          />
        </Node.ExpandToggleButton>
        <Node.IconContainer>
          <Icon
            {...(typeof item.icon === "string"
              ? { name: item.icon }
              : item.icon)}
          />
        </Node.IconContainer>
        <Node.NameContainer miw={0} data-testid="tree-item-name">
          <Text
            className={S.name}
            fw="bold"
            lh="normal"
            truncate
            title={item.name}
          >
            {item.name}
          </Text>
          {item.data?.detail && (
            <Text
              fz="sm"
              fw="normal"
              lh="normal"
              c="inherit"
              truncate
              title={item.data.detail}
            >
              {item.data.detail}
            </Text>
          )}
        </Node.NameContainer>
        {rightSection?.(item)}
      </Node.Root>
    );
  },
);

function NoResults() {
  return (
    <Box mt="6.25rem">
      <EmptyState message={t`No results found`} icon="search" />
    </Box>
  );
}

function Message({ children }: { children: string }) {
  return (
    <Text c="text-secondary" px="xl" py="md">
      {children}
    </Text>
  );
}
