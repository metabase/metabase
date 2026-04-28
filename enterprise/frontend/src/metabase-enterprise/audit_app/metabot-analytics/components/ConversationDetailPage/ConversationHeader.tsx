import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import {
  skipToken,
  useListPermissionsGroupsQuery,
  useListUserMembershipsQuery,
} from "metabase/api";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import { PLUGIN_TENANTS } from "metabase/plugins";
import {
  ActionIcon,
  Anchor,
  Flex,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { isAdminGroup, isDefaultGroup } from "metabase/utils/groups";
import * as Urls from "metabase/utils/urls";
import { getUserName } from "metabase/utils/user";
import { useGetTenantQuery } from "metabase-enterprise/api";
import * as EnterpriseUrls from "metabase-enterprise/urls";

import type { ConversationDetail } from "../../types";

import S from "./ConversationDetailPage.module.css";

export function ConversationHeader({
  conversation,
}: {
  conversation: ConversationDetail;
}) {
  const userGroupsInfo = useUserGroupsInfo(conversation.user?.id);
  const tenantId = conversation.user?.tenant_id ?? null;
  const { data: tenant } = useGetTenantQuery(
    PLUGIN_TENANTS.isEnabled && tenantId != null ? tenantId : skipToken,
  );

  const userName = conversation.user
    ? getUserName(conversation.user) || t`Unknown`
    : t`Unknown`;
  const firstName = conversation.user?.first_name?.trim() || userName;
  const firstProfile = conversation.profile_id ?? undefined;

  return (
    <>
      <Breadcrumbs
        crumbs={[
          [t`Conversations`, "/admin/metabot/usage-auditing/conversations"],
          <>
            {userName}, <DateTime value={conversation.created_at} />
          </>,
        ]}
      />

      <Flex justify="space-between" align="flex-start" gap="md">
        <Stack gap="sm">
          <Flex align="baseline">
            <Title order={2}>{t`Conversation with ${userName}`}</Title>
            {conversation.user && (
              <Menu shadow="md" position="bottom-start" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="text-secondary"
                    aria-label={t`User actions`}
                  >
                    <Icon name="ellipsis" size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    component={ForwardRefLink}
                    to={`/admin/metabot/usage-auditing/conversations?user=${conversation.user.id}`}
                  >
                    {t`See all of ${firstName}'s conversations`}
                  </Menu.Item>
                  <Menu.Item
                    component={ForwardRefLink}
                    to={Urls.editUser(conversation.user)}
                  >
                    {t`View ${firstName}'s details`}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Flex>
          <Flex gap="lg" align="center" wrap="wrap">
            <Flex gap="xs" align="center">
              <Icon name="calendar" size={16} c="text-tertiary" />
              <Text size="md" c="text-secondary">
                <DateTime value={conversation.created_at} unit="day" />
              </Text>
            </Flex>
            {firstProfile && (
              <Flex gap="xs" align="center">
                <Icon name="metabot" size={16} c="text-tertiary" />
                <Text size="md" c="text-secondary">
                  {renderMetabotProfileLabel(firstProfile)}
                </Text>
              </Flex>
            )}
            {(userGroupsInfo.userGroups.length > 0 ||
              userGroupsInfo.isAdmin) && (
              <Flex gap="xs" align="center">
                <Icon name="group" size={16} c="text-tertiary" />
                <UserGroupsMenu {...userGroupsInfo} />
              </Flex>
            )}
            {tenant && (
              <Flex gap="xs" align="center">
                <Icon name="company" size={16} c="text-tertiary" />
                <Anchor
                  component={ForwardRefLink}
                  to={EnterpriseUrls.editTenant(tenant.id)}
                  c="text-secondary"
                  size="md"
                  underline="hover"
                >
                  {tenant.name}
                </Anchor>
              </Flex>
            )}
          </Flex>
        </Stack>
      </Flex>
    </>
  );
}

function useUserGroupsInfo(userId: number | undefined) {
  const { data: membershipsByUser } = useListUserMembershipsQuery();
  const { data: groups } = useListPermissionsGroupsQuery({});

  return useMemo(() => {
    if (userId == null || !membershipsByUser || !groups) {
      return { userGroups: [], isAdmin: false };
    }
    const memberships = membershipsByUser[userId] ?? [];
    const selectedGroupIds = memberships.map((m) => m.group_id);
    const isAdmin = groups.some(
      (g) => selectedGroupIds.includes(g.id) && isAdminGroup(g),
    );
    const userGroups = groups.filter(
      (g) =>
        selectedGroupIds.includes(g.id) &&
        !isDefaultGroup(g) &&
        !isAdminGroup(g),
    );
    return { userGroups, isAdmin };
  }, [userId, membershipsByUser, groups]);
}

function UserGroupsMenu({
  userGroups,
  isAdmin,
}: ReturnType<typeof useUserGroupsInfo>) {
  if (userGroups.length === 0 && !isAdmin) {
    return null;
  }

  const n = userGroups.length;
  const otherGroupsLabel =
    n === 1
      ? userGroups[0].name
      : ngettext(msgid`${n} other group`, `${n} other groups`, n);
  const summaryText = isAdmin
    ? n === 0
      ? t`Admin`
      : t`Admin and ${otherGroupsLabel}`
    : n === 1
      ? userGroups[0].name
      : ngettext(msgid`${n} group`, `${n} groups`, n);

  if (userGroups.length === 0) {
    return (
      <Text size="md" c="text-secondary">
        {summaryText}
      </Text>
    );
  }

  return (
    <Menu shadow="md" position="bottom-start" withinPortal>
      <Menu.Target>
        <Anchor
          component="button"
          type="button"
          underline="never"
          c="text-secondary"
          size="md"
          fw="normal"
          className={S.groupsTarget}
        >
          <Flex component="span" align="center" gap={4}>
            <span>{summaryText}</span>
            <Icon name="chevrondown" size={10} c="text-tertiary" />
          </Flex>
        </Anchor>
      </Menu.Target>
      <Menu.Dropdown miw="14rem">
        <Menu.Label>{t`View a group's permissions`}</Menu.Label>
        {userGroups.map((group) => (
          <Menu.Item
            key={group.id}
            component={ForwardRefLink}
            to={getGroupFocusPermissionsUrl(group.id)}
            leftSection={<Icon name="group" size={14} />}
          >
            {group.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
