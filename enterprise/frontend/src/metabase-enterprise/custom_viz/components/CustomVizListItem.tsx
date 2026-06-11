import { useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Link } from "metabase/common/components/Link";
import { ActionIcon, Box, Flex, Group, Icon, Menu, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useUpdateCustomVizPluginMutation } from "metabase-enterprise/api";
import type { CustomVizPlugin, CustomVizPluginId } from "metabase-types/api";

import { trackCustomVizPluginToggled } from "../analytics";

import S from "./CustomVizListItem.module.css";
import { CustomVizPluginSummary } from "./CustomVizPluginSummary";

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
      justify="space-between"
      align="center"
      gap="md"
      p="md"
      className={S.customVizListItem}
    >
      <CustomVizPluginSummary plugin={plugin} />

      {!plugin.enabled && (
        <Group align="center" flex="0 0 auto" gap="xs">
          <Text c="text-secondary" fw={500}>
            {t`Disabled`}
          </Text>
        </Group>
      )}

      <Box className={S.menuContainer} flex="0 0 auto">
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
              component={Link}
              to={Urls.customVizEdit(plugin.id)}
              leftSection={<Icon name="upload" />}
            >
              {t`Replace bundle`}
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
