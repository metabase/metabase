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
  getRequiredCollections,
} from "../../utils";

import S from "./RemoteSyncDependecyModal.module.css";

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

  const requiredCollections = getRequiredCollections(failures);
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
      title={t`Couldn’t sync selected collection`}
    >
      <Stack gap="lg" pt="md">
        <Text>{getBlockedMessage(failures)}</Text>

        {requiredCollections.length > 0 && (
          <Card withBorder p={0} shadow="none">
            <Stack gap={0}>
              {requiredCollections.map((collection) => (
                <Group
                  key={collection.id}
                  gap="sm"
                  className={S.collectionRow}
                  py="sm"
                  px="md"
                  justify="space-between"
                  bg={collection.personal ? "background-secondary" : undefined}
                >
                  {collection.personal ? (
                    <>
                      <Group>
                        <Icon name="person" c="text-secondary" />
                        <Text fw="medium">{collection.name}</Text>
                      </Group>
                      <Text c="text-secondary">{t`Can't be synced`}</Text>
                    </>
                  ) : (
                    <>
                      <Group>
                        <Icon name="collection" c="text-secondary" />
                        <Text fw="medium">{collection.name}</Text>
                      </Group>
                      <Group gap="sm">
                        <Icon name="warning_triangle_filled" c="warning" />
                        <Text c="feedback-warning-strong">{t`Sync to continue`}</Text>
                      </Group>
                    </>
                  )}
                </Group>
              ))}
            </Stack>
          </Card>
        )}

        <Group justify={canSync ? "space-between" : "end"} gap="sm">
          <>
            {canSync && (
              <Button variant="subtle" onClick={handleSyncAndSave}>
                {t`Sync required collections`}
              </Button>
            )}
            <Button
              variant="filled"
              onClick={handleDismiss}
              style={{ justifySelf: "end" }}
            >
              {t`Done`}
            </Button>
          </>
        </Group>
      </Stack>
    </Modal>
  );
};
