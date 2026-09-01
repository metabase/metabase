import { useFormikContext } from "formik";
import { useState } from "react";
import { t } from "ttag";

import { Button, Card, Group, Icon, Modal, Stack, Text } from "metabase/ui";
import type { RemoteSyncDependencyFailure } from "metabase-types/api";

import { COLLECTIONS_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import {
  canSyncRequiredCollections,
  getBlockedMessage,
  getRequiredCollectionRows,
  getRequiredCollections,
} from "../../utils";

import S from "./RemoteSyncDependencyModal.module.css";

interface RemoteSyncDependencyModalProps {
  /** Why the last save was refused, one entry per collection. */
  failures?: RemoteSyncDependencyFailure[];
}

export const RemoteSyncDependencyModal = ({
  failures,
}: RemoteSyncDependencyModalProps) => {
  const { values, setValues, submitForm } =
    useFormikContext<RemoteSyncSettingsFormState>();
  // RTK returns a new error object per request, so identity separates fresh from dismissed.
  const [dismissedFailures, setDismissedFailures] =
    useState<RemoteSyncDependencyFailure[]>();

  if (!failures?.length || failures === dismissedFailures) {
    return null;
  }

  // Rows are for display and can include Our analytics; only real remedies are safe to switch on.
  const requiredCollections = getRequiredCollections(failures);
  const requiredCollectionRows = getRequiredCollectionRows(failures);
  const canSync = canSyncRequiredCollections(failures);

  const handleDismiss = () => setDismissedFailures(failures);

  const handleSyncAndSave = async () => {
    await setValues({
      ...values,
      [COLLECTIONS_KEY]: {
        ...values[COLLECTIONS_KEY],
        ...Object.fromEntries(requiredCollections.map(({ id }) => [id, true])),
      },
    });
    await submitForm();
  };

  return (
    <Modal
      opened
      onClose={handleDismiss}
      padding="xl"
      title={
        canSync
          ? t`Sync collections with dependencies?`
          : t`Couldn’t sync selected collection`
      }
    >
      <Stack gap="lg" pt="md">
        <Text>{getBlockedMessage(failures)}</Text>

        {requiredCollectionRows.length > 0 && (
          <Card withBorder p={0} shadow="none">
            <Stack gap={0}>
              {requiredCollectionRows.map((collection) => (
                <Group
                  key={collection.id}
                  gap="sm"
                  className={S.collectionRow}
                  py="sm"
                  px="md"
                  justify="space-between"
                  bg={collection.syncable ? undefined : "background-secondary"}
                >
                  <Group>
                    <Icon
                      name={collection.personal ? "person" : "collection"}
                      c="text-secondary"
                    />
                    <Text fw="medium">{collection.name}</Text>
                  </Group>
                  {collection.syncable ? (
                    <Group gap="sm">
                      <Icon name="warning_triangle_filled" c="warning" />
                      <Text c="feedback-warning-strong">{t`Sync to continue`}</Text>
                    </Group>
                  ) : (
                    <Text c="text-secondary">{t`Can't be synced`}</Text>
                  )}
                </Group>
              ))}
            </Stack>
          </Card>
        )}

        <Group justify={canSync ? "space-between" : "end"} gap="sm">
          <>
            {canSync && (
              <Button onClick={handleSyncAndSave}>
                {t`Sync required collections`}
              </Button>
            )}
            <Button
              variant="filled"
              onClick={handleDismiss}
              style={{ justifySelf: "end" }}
            >
              {canSync ? t`Cancel` : t`Back`}
            </Button>
          </>
        </Group>
      </Stack>
    </Modal>
  );
};
