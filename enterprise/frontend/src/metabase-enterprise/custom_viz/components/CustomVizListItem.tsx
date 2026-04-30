import { useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
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
import * as Urls from "metabase/urls";
import { useUpdateCustomVizPluginMutation } from "metabase-enterprise/api";
import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

import { trackCustomVizPluginToggled } from "../analytics";

import { CustomVizIcon } from "./CustomVizIcon";
import S from "./CustomVizListItem.module.css";

type Props = {
  plugin: CustomVizPlugin;
  onDelete: (id: CustomVizPluginId) => void;
};

export function CustomVizListItem({ plugin, onDelete }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [updatePlugin] = useUpdateCustomVizPluginMutation();

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(plugin.id);
      setIsConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [plugin.id, onDelete]);

  const handleToggleEnabled = useCallback(async () => {
    await updatePlugin({ id: plugin.id, enabled: !plugin.enabled });
    trackCustomVizPluginToggled(plugin.enabled ? "disabled" : "enabled");
  }, [plugin.id, plugin.enabled, updatePlugin]);

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
          </Group>
          {(plugin.bundle_hash || plugin.metabase_version) && (
            <Group gap="xs">
              {plugin.bundle_hash && (
                <Text size="sm" c="text-tertiary">
                  {t`Bundle`}: {plugin.bundle_hash.slice(0, 8)}
                </Text>
              )}
              {plugin.bundle_hash && plugin.metabase_version && (
                <Text size="sm" c="text-tertiary">
                  &bull;
                </Text>
              )}
              {plugin.metabase_version && (
                <Text size="sm" c="text-tertiary">
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page */}
                  {t`Requires Metabase`} {plugin.metabase_version}
                </Text>
              )}
            </Group>
          )}
          {plugin.error_message && (
            <Text size="sm" c="error">
              {plugin.error_message}
            </Text>
          )}
        </Stack>
      </Group>

      {!plugin.enabled && (
        <Group align="center" flex="0 0 auto" gap="xs">
          <Text c="text-secondary" fw={500}>
            {t`Disabled`}
          </Text>
        </Group>
      )}

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
            <ActionIcon
              aria-label={t`Plugin actions`}
              variant="subtle"
              loading={isDeleting}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name={plugin.enabled ? "pause" : "play"} />}
              onClick={handleToggleEnabled}
            >
              {plugin.enabled ? t`Disable` : t`Enable`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="trash" />}
              color="error"
              onClick={() => setIsConfirmOpen(true)}
            >
              {t`Remove`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <ConfirmModal
          opened={isConfirmOpen}
          title={t`Remove this visualization?`}
          message={t`Any saved question that uses it will switch to a default visualization based on its data.`}
          confirmButtonText={t`Remove`}
          confirmButtonProps={{ disabled: isDeleting }}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      </Box>
    </Flex>
  );
}
