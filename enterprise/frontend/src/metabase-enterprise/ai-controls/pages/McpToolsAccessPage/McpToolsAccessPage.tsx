import { useMemo, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SettingsPageWrapper } from "metabase/settings-components";
import { Card, Group, Icon, Stack, Text, TextInput, Title } from "metabase/ui";
import {
  useDisableAdvancedMcpToolPermissionsMutation,
  useEnableAdvancedMcpToolPermissionsMutation,
} from "metabase-enterprise/api";
import type { GroupInfo } from "metabase-types/api";

import { AdvancedGroupModeButton } from "../../components/AdvancedGroupMode";
import { GearIconMenu } from "../../components/GearIconMenu";
import { GroupCategoryTabs } from "../../components/GroupCategoryTabs";
import { useAccessGroups, useAdvancedModeSwitch } from "../../hooks";
import { getVisibleGroups } from "../../utils";

import { McpToolsSaveBar } from "./McpToolsSaveBar";
import {
  McpToolsGrid,
  buildGridColumns,
  buildGridRows,
  filterGridColumns,
} from "./components/McpToolsGrid";
import { useMcpToolPermissions } from "./useMcpToolPermissions";

const NO_GROUPS: GroupInfo[] = [];

export function McpToolsAccessPage() {
  const groups = useAccessGroups();
  const mcp = useMcpToolPermissions();
  const advancedMode = useAdvancedModeSwitch({
    enable: useEnableAdvancedMcpToolPermissionsMutation(),
    disable: useDisableAdvancedMcpToolPermissionsMutation(),
  });
  const [query, setQuery] = useState("");

  const rows = useMemo(() => buildGridRows(mcp.tools), [mcp.tools]);
  const columns = useMemo(
    () =>
      buildGridColumns(
        getVisibleGroups(
          groups.groups ?? NO_GROUPS,
          mcp.advanced,
          groups.activeTab,
        ),
        mcp.permissionsByGroup,
      ),
    [groups.groups, groups.activeTab, mcp.advanced, mcp.permissionsByGroup],
  );
  const visibleColumns = filterGridColumns(columns, query);

  const showSwitchButton = !mcp.advanced && groups.activeTab === "user-groups";
  const noMatches = visibleColumns.length === 0 && query.trim() !== "";

  return (
    <SettingsPageWrapper h="100%" mih={0} w="100%" p="xxl" gap="lg">
      <LeaveRouteConfirmModal
        isEnabled={mcp.isDirty}
        onConfirm={mcp.onCancel}
      />

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm">
          <Title order={1}>{t`MCP tools access`}</Title>
          <Text c="text-secondary" lh={1.5} maw="40rem">
            {t`Choose which MCP tools each group's AI clients can use. Administrators always have every tool, and people still need their usual data and collection permissions.`}
          </Text>
        </Stack>
        {mcp.advanced && (
          <GearIconMenu
            loading={advancedMode.isDisabling}
            onConfirm={advancedMode.disable}
          />
        )}
      </Group>

      {groups.isUsingTenants && (
        <GroupCategoryTabs
          setActiveTab={groups.setActiveTab}
          activeTab={groups.activeTab}
        />
      )}

      {mcp.advanced && (
        <TextInput
          leftSection={<Icon name="search" />}
          placeholder={t`Search for a group...`}
          aria-label={t`Search for a group`}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      )}

      <LoadingAndErrorWrapper
        loading={groups.isLoading || mcp.isLoading}
        error={groups.error || mcp.error}
        noWrapper
      >
        <Card withBorder p={0} radius="sm" mih={0}>
          {noMatches ? (
            <Text c="text-secondary" p="xl" ta="center">
              {t`No groups match your search`}
            </Text>
          ) : (
            <McpToolsGrid
              rows={rows}
              columns={visibleColumns}
              allTools={mcp.tools}
              headerTrailing={
                showSwitchButton ? (
                  <AdvancedGroupModeButton
                    message={t`This will remove MCP tool access from the "All Users" group, so users won't have MCP tool access unless they're added to a group that has it.`}
                    loading={advancedMode.isEnabling}
                    onConfirm={advancedMode.enable}
                  />
                ) : undefined
              }
              onPermissionChange={mcp.onPermissionChange}
            />
          )}
          {mcp.isDirty && (
            <McpToolsSaveBar
              isSaving={mcp.isSaving}
              onSave={mcp.onSave}
              onCancel={mcp.onCancel}
            />
          )}
        </Card>
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
}
