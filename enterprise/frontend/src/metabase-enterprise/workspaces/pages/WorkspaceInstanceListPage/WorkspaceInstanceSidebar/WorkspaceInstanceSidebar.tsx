import { useDisclosure } from "@mantine/hooks";
import { memo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { WorkspaceInstance } from "metabase-types/api";

import { SidebarInfoSection } from "../../../components/SidebarInfoSection";
import { DeleteInstanceModal } from "../../../components/WorkspaceSettingsSection/DeleteInstanceModal";
import { EditInstanceModal } from "../../../components/WorkspaceSettingsSection/EditInstanceModal";
import { getInstanceStatusLabel } from "../WorkspaceInstanceTable/columns";

import S from "./WorkspaceInstanceSidebar.module.css";

type WorkspaceInstanceSidebarProps = {
  instance: WorkspaceInstance;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const WorkspaceInstanceSidebar = memo(function WorkspaceInstanceSidebar({
  instance,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: WorkspaceInstanceSidebarProps) {
  const [isRenameOpen, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  const handleDeleted = () => {
    closeDelete();
    onClose();
  };

  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="xl"
        bg="background-primary"
        data-testid="workspace-instance-sidebar"
      >
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fz="h3" fw="bold" lh="h3">
              {instance.name}
            </Text>
            <ActionIcon aria-label={t`Close`} onClick={onClose}>
              <FixedSizeIcon name="close" />
            </ActionIcon>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Button
              component="a"
              href={instance.url}
              target="_blank"
              rel="noreferrer"
              variant="filled"
              flex={1}
              leftSection={<FixedSizeIcon name="external" aria-hidden />}
            >
              {t`Open instance`}
            </Button>
            <Menu>
              <Menu.Target>
                <ActionIcon variant="default" aria-label={t`Instance actions`}>
                  <FixedSizeIcon name="ellipsis" aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<FixedSizeIcon name="pencil" aria-hidden />}
                  onClick={openRename}
                >
                  {t`Rename`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <SidebarInfoSection
            items={[
              {
                label: t`URL`,
                value: (
                  <Anchor href={instance.url} target="_blank" rel="noreferrer">
                    {instance.url}
                  </Anchor>
                ),
              },
              {
                label: t`Status`,
                value: getInstanceStatusLabel(instance),
              },
              {
                label: t`Created at`,
                value: "",
                date: instance.created_at,
              },
            ]}
          />

          <Box>
            <Button
              variant="subtle"
              color="error"
              leftSection={<FixedSizeIcon name="trash" aria-hidden />}
              onClick={openDelete}
            >
              {t`Delete instance`}
            </Button>
          </Box>
        </Stack>
      </Stack>

      <EditInstanceModal
        instance={instance}
        opened={isRenameOpen}
        onSave={closeRename}
        onClose={closeRename}
      />
      <DeleteInstanceModal
        instance={instance}
        opened={isDeleteOpen}
        onDelete={handleDeleted}
        onClose={closeDelete}
      />
    </SidebarResizableBox>
  );
});
