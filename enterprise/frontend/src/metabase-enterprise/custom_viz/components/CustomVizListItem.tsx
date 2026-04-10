import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useRefreshCustomVizPluginMutation,
  useUpdateCustomVizPluginMutation,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

import { CustomVizIcon } from "./CustomVizIcon";
import S from "./CustomVizListItem.module.css";

type Props = {
  plugin: CustomVizPlugin;
  onDelete: (id: CustomVizPluginId) => void;
};

export function CustomVizListItem({ plugin, onDelete }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatePlugin] = useUpdateCustomVizPluginMutation();
  const [refreshPlugin, { isLoading: isRefreshing }] =
    useRefreshCustomVizPluginMutation();

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(plugin.id);
    } finally {
      setIsDeleting(false);
    }
  }, [plugin.id, onDelete]);

  const handleToggleEnabled = useCallback(async () => {
    await updatePlugin({ id: plugin.id, enabled: !plugin.enabled });
  }, [plugin.id, plugin.enabled, updatePlugin]);

  const handleRefresh = useCallback(async () => {
    await refreshPlugin(plugin.id);
  }, [plugin.id, refreshPlugin]);

  return (
    <Flex
      component={Link}
      to={Urls.customVizEdit(plugin.id)}
      justify="space-between"
      align="center"
      gap="md"
      p="md"
      className={S.customVizListItem}
    >
      <Group align="flex-start" flex="1" wrap="nowrap">
        <CustomVizIcon plugin={plugin} />
        <Stack flex="1" gap="xs" py="xs">
          <Group justify="space-between">
            <Text fw={700}>{plugin.display_name}</Text>

            <Group align="center" flex="0 0 auto" gap="xs">
              {plugin.enabled && <Icon c="success" name="check" />}

              <Text
                c={plugin.enabled ? "success" : "text-secondary"}
                fw={plugin.enabled ? 700 : undefined}
              >
                {plugin.enabled ? t`Enabled` : t`Disabled`}
              </Text>
            </Group>
          </Group>
          <Group gap="xs">
            <Text
              component="a"
              href={plugin.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              c="text-tertiary"
              td="underline"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {plugin.repo_url}
            </Text>
            {plugin.resolved_commit && (
              <>
                <Text size="sm" c="text-tertiary">
                  &bull;
                </Text>
                <Text size="sm" c="text-tertiary">
                  {t`Commit`}: {plugin.resolved_commit.slice(0, 8)}
                </Text>
              </>
            )}
          </Group>
          {plugin.error_message && (
            <Text size="sm" c="error">
              {plugin.error_message}
            </Text>
          )}
        </Stack>
      </Group>

      <Box
        className={S.menuContainer}
        flex="0 0 auto"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <Menu>
          <Menu.Target>
            <ActionIcon variant="subtle" loading={isRefreshing || isDeleting}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="refresh" />}
              onClick={handleRefresh}
            >
              {t`Re-fetch`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name={plugin.enabled ? "pause" : "play"} />}
              onClick={handleToggleEnabled}
            >
              {plugin.enabled ? t`Disable` : t`Enable`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="trash" />}
              color="error"
              onClick={handleDelete}
            >
              {t`Remove`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Flex>
  );
}
