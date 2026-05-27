import { useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Link } from "metabase/common/components/Link";
import { ActionIcon, Box, Flex, Icon, Menu } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { DataAppSummary } from "./DataAppSummary";

type Props = {
  app: DataApp;
  onDelete: (name: string) => Promise<void> | void;
};

export function DataAppListItem({ app, onDelete }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(app.name);
      setIsConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [app.name, onDelete]);

  return (
    <Flex justify="space-between" align="center" gap="md" p="md">
      <DataAppSummary app={app} />

      <Box flex="0 0 auto">
        <Menu>
          <Menu.Target>
            <ActionIcon
              aria-label={t`Data app actions`}
              variant="subtle"
              loading={isDeleting}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              component={Link}
              to={`/data-app/${encodeURIComponent(app.name)}`}
              leftSection={<Icon name="external" />}
            >
              {t`Open`}
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
          title={t`Remove this data app?`}
          message={t`Any link pointing at /data-app/${app.name} will stop working.`}
          confirmButtonText={t`Remove`}
          confirmButtonProps={{ disabled: isDeleting }}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      </Box>
    </Flex>
  );
}
