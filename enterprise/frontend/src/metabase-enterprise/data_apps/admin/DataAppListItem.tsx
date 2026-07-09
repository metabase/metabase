import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useConfirmation, useToast } from "metabase/common/hooks";
import { Button, Flex, Group, Icon, Switch } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useDeleteDataAppMutation,
  useSetDataAppEnabledMutation,
} from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { DataAppSummary } from "./DataAppSummary";

type Props = {
  app: DataApp;
  /**
   * When true (the repo is unlinked), the app is no longer backed by a source,
   * so we offer to remove it from the DB. While a repo is connected a sync would
   * just re-materialize it, so removal is hidden.
   */
  canRemove?: boolean;
};

export function DataAppListItem({ app, canRemove = false }: Props) {
  const [setEnabled, { isLoading }] = useSetDataAppEnabledMutation();
  const [deleteDataApp, { isLoading: isDeleting }] = useDeleteDataAppMutation();
  const [sendToast] = useToast();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  // Optimistic local state so the toggle flips immediately instead of snapping
  // back until the list refetch lands; re-synced whenever the server value changes.
  const [enabled, setLocalEnabled] = useState(app.enabled);
  useEffect(() => {
    setLocalEnabled(app.enabled);
  }, [app.enabled]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setLocalEnabled(next);
      try {
        await setEnabled({ name: app.name, enabled: next }).unwrap();
      } catch {
        setLocalEnabled(!next);
        sendToast({ message: t`Failed to update this app`, icon: "warning" });
      }
    },
    [app.name, setEnabled, sendToast],
  );

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
    <Flex justify="space-between" align="center" gap="md" p="md">
      <DataAppSummary app={app} />

      <Group flex="0 0 auto" gap="md" wrap="nowrap">
        <Switch
          aria-label={t`Enable ${app.display_name}`}
          checked={enabled}
          disabled={isLoading}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
          size="sm"
        />

        <Button
          component="a"
          href={
            enabled ? Urls.getSubpathSafeUrl(Urls.dataApp(app.name)) : undefined
          }
          target="_blank"
          rel="noreferrer"
          leftSection={<Icon name="external" />}
          variant="subtle"
          disabled={!enabled}
        >
          {t`Open`}
        </Button>

        {canRemove && (
          <Button
            leftSection={<Icon name="trash" />}
            variant="subtle"
            color="error"
            disabled={isDeleting}
            onClick={handleRemove}
          >
            {t`Remove`}
          </Button>
        )}
      </Group>

      {confirmationModal}
    </Flex>
  );
}
