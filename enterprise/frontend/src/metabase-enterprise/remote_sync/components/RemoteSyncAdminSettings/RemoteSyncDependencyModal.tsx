import { useFormikContext } from "formik";
import { useState } from "react";
import { c, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import {
  Accordion,
  Anchor,
  Button,
  Card,
  Ellipsified,
  Group,
  Icon,
  Modal,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import { collection as collectionUrl } from "metabase/urls";
import type {
  CollectionSyncPreferences,
  RemoteSyncRequiredSync,
} from "metabase-types/api";

import { COLLECTIONS_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import {
  getBlockedMessage,
  getListedRequiredSyncs,
  getRequiredSyncRow,
} from "../../utils";

import S from "./RemoteSyncDependencyModal.module.css";

interface RemoteSyncDependencyModalProps {
  /** Why the last save was refused, one entry per collection that has to be synced. */
  required?: RemoteSyncRequiredSync[];
}

export const RemoteSyncDependencyModal = ({
  required,
}: RemoteSyncDependencyModalProps) => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncSettingsFormState>();
  // RTK returns a new error object per request, so identity separates fresh from dismissed.
  const [dismissedRequired, setDismissedRequired] =
    useState<RemoteSyncRequiredSync[]>();

  if (!required?.length || required === dismissedRequired) {
    return null;
  }

  const listedRequiredSyncs = getListedRequiredSyncs(required);
  const syncedCollections = values[COLLECTIONS_KEY] ?? {};

  const handleDismiss = () => setDismissedRequired(required);

  // Nested path, so the write survives the form reinitializing under the modal.
  const handleToggle = (id: number, checked: boolean) =>
    setFieldValue(`${COLLECTIONS_KEY}.${id}`, checked);

  return (
    <Modal
      opened
      onClose={handleDismiss}
      padding="xxl"
      title={t`Couldn’t sync selected collection`}
      withCloseButton={false}
    >
      <Stack gap="xl" pt="lg">
        <Text>{getBlockedMessage(required)}</Text>

        {listedRequiredSyncs.length > 0 && (
          <Accordion
            multiple
            chevronPosition="left"
            className={S.accordion}
            classNames={{
              item: S.item,
              control: S.control,
              label: S.label,
              chevron: S.chevron,
              content: S.content,
            }}
          >
            {listedRequiredSyncs.map((requiredSync) => (
              <RequiredSyncItem
                key={getRequiredSyncRow(requiredSync).key}
                requiredSync={requiredSync}
                syncedCollections={syncedCollections}
                onToggle={handleToggle}
              />
            ))}
          </Accordion>
        )}

        <Group justify="end" gap="sm">
          <Button variant="filled" onClick={handleDismiss}>
            {t`Close`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface RequiredSyncItemProps {
  requiredSync: RemoteSyncRequiredSync;
  syncedCollections: CollectionSyncPreferences;
  onToggle: (id: number, checked: boolean) => void;
}

const RequiredSyncItem = ({
  requiredSync,
  syncedCollections,
  onToggle,
}: RequiredSyncItemProps) => {
  const getIcon = PLUGIN_COLLECTIONS.useGetIcon();
  const { dependencies } = requiredSync;
  const row = getRequiredSyncRow(requiredSync);
  const { syncableId } = row;
  const isSynced = syncableId != null && !!syncedCollections[syncableId];

  const icon = getIcon({
    model: "collection",
    type: row.type,
    is_personal: row.personal,
    location: "/",
    is_remote_synced: isSynced,
    is_library_root: row.type === "library",
  });

  return (
    <Accordion.Item value={row.key} mt="sm">
      {/* The switch sits outside the control, so flipping it doesn't also toggle the panel. */}
      <Group
        gap="sm"
        px="md"
        wrap="nowrap"
        bg={"background-secondary"}
        bdrs="md"
      >
        <Accordion.Control>
          <Group gap="sm">
            <Icon name={icon.name} c={icon.color ?? "text-secondary"} />
            <Text fw="medium">{row.name}</Text>
          </Group>
        </Accordion.Control>
        {syncableId == null ? (
          <Text c="text-secondary">{t`Can't be synced`}</Text>
        ) : (
          <Group gap="sm" wrap="nowrap">
            <Switch
              size="sm"
              checked={isSynced}
              onChange={(event) =>
                onToggle(syncableId, event.currentTarget.checked)
              }
              aria-label={c("{0} is the name of a metabase collection")
                .t`Sync ${row.name}`}
            />
            <Text>{t`Sync`}</Text>
          </Group>
        )}
      </Group>
      <Accordion.Panel>
        <Card withBorder mb="md" p={0} shadow="none">
          <Group
            px="md"
            py="xs"
            bg="background-secondary"
            className={S.contentRow}
          >
            <Text className={S.cell} fz="sm">{t`Item`}</Text>
            <Text className={S.cell} fz="sm">{t`Used By`}</Text>
          </Group>
          {dependencies.map((dependency) => (
            <Group
              px="md"
              py="sm"
              className={S.contentRow}
              key={`${dependency.model}-${dependency.id}`}
            >
              <Group className={S.cell} gap="sm" wrap="nowrap">
                <Icon
                  name={
                    getIcon({
                      model: dependency.model,
                      display: dependency.display,
                    }).name
                  }
                />
                <Ellipsified>{dependency.name}</Ellipsified>
              </Group>
              <Ellipsified className={S.cell}>
                {dependency.used_by.map((used) => used.name).join(", ")}
              </Ellipsified>
            </Group>
          ))}
        </Card>

        {row.collectionId != null && (
          <Anchor
            component={Link}
            to={collectionUrl({ id: row.collectionId, name: row.name })}
            target="_blank"
          >
            <Group gap="xs">
              {t`Go to collection`}
              <Icon name="external" />
            </Group>
          </Anchor>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};
