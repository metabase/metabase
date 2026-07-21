import { useCallback } from "react";
import { t } from "ttag";

import { useConfirmation, useToast } from "metabase/common/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import {
  useDeleteDataAppMutation,
  useSetDataAppEnabledMutation,
} from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

type Props = {
  app: DataApp;
  canRemove?: boolean;
};

export const DataAppActionsMenu = ({ app, canRemove = false }: Props) => {
  const [setEnabled] = useSetDataAppEnabledMutation();
  const [deleteDataApp, { isLoading: isDeleting }] = useDeleteDataAppMutation();
  const [sendToast] = useToast();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const handleToggleEnabled = useCallback(async () => {
    try {
      await setEnabled({ name: app.name, enabled: !app.enabled }).unwrap();
    } catch {
      sendToast({ message: t`Failed to update this app`, icon: "warning" });
    }
  }, [app.name, app.enabled, setEnabled, sendToast]);

  const handleRemove = useCallback(() => {
    showConfirmation({
      title: t`Remove ${app.display_name} app?`,
      message: t`This removes the data app, which won't be reachable until it's synced again from a connected repository.`,
      confirmButtonText: t`Remove`,
      onConfirm: async () => {
        try {
          await deleteDataApp(app.name).unwrap();
        } catch {
          sendToast({
            message: t`Failed to remove this data app`,
            icon: "warning",
          });
        }
      },
    });
  }, [app.display_name, app.name, deleteDataApp, sendToast, showConfirmation]);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t`Actions for ${app.display_name}`}
            variant="subtle"
            c="text-secondary"
            loading={isDeleting}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item onClick={handleToggleEnabled}>
            {app.enabled ? t`Disable` : t`Re-enable`}
          </Menu.Item>

          {canRemove && (
            <Menu.Item onClick={handleRemove}>{t`Remove`}</Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      {confirmationModal}
    </>
  );
};
