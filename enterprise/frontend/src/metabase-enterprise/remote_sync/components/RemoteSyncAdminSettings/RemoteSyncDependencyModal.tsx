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
  RemoteSyncDependencyFailure,
  RemoteSyncIneligibleDependency,
} from "metabase-types/api";

import { COLLECTIONS_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import type { RequiredCollectionRow } from "../../utils";
import {
  getBlockedMessage,
  getRequiredCollectionRows,
  getRowDependencies,
  isSyncableRow,
} from "../../utils";

import S from "./RemoteSyncDependencyModal.module.css";

interface RemoteSyncDependencyModalProps {
  /** Why the last save was refused, one entry per collection. */
  failures?: RemoteSyncDependencyFailure[];
}

export const RemoteSyncDependencyModal = ({
  failures,
}: RemoteSyncDependencyModalProps) => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncSettingsFormState>();
  // RTK returns a new error object per request, so identity separates fresh from dismissed.
  const [dismissedFailures, setDismissedFailures] =
    useState<RemoteSyncDependencyFailure[]>();

  if (!failures?.length || failures === dismissedFailures) {
    return null;
  }

  // Rows are for display and can include Our analytics; only real remedies are safe to switch on.
  const requiredCollectionRows = getRequiredCollectionRows(failures);
  const rowDependencies = getRowDependencies(failures);
  const syncedCollections = values[COLLECTIONS_KEY] ?? {};

  const handleDismiss = () => setDismissedFailures(failures);

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
        <Text>{getBlockedMessage(failures)}</Text>

        {requiredCollectionRows.length > 0 && (
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
            {requiredCollectionRows.map((row) => (
              <RequiredCollectionRowItem
                key={row.id}
                row={row}
                dependencies={rowDependencies.get(row.id) ?? []}
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

interface RequiredCollectionRowItemProps {
  row: RequiredCollectionRow;
  dependencies: RemoteSyncIneligibleDependency[];
  syncedCollections: CollectionSyncPreferences;
  onToggle: (id: number, checked: boolean) => void;
}

const RequiredCollectionRowItem = ({
  row,
  dependencies,
  syncedCollections,
  onToggle,
}: RequiredCollectionRowItemProps) => {
  const getIcon = PLUGIN_COLLECTIONS.useGetIcon();
  const syncableId = isSyncableRow(row) ? row.id : null;
  const isSynced = syncableId != null && !!syncedCollections[syncableId];
  // Same inputs CollectionSyncRow gives it, so a row reads the same here as in the settings list.
  // `location` because a remedy is always top-level, which is where a personal one earns its icon.
  const icon = getIcon({
    model: "collection",
    type: row.type,
    is_personal: row.personal,
    location: "/",
    is_remote_synced: isSynced,
    is_library_root: row.type === "library",
  });

  return (
    <Accordion.Item value={String(row.id)} mt="sm">
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

        <Anchor
          component={Link}
          to={collectionUrl({ id: row.id, name: row.name })}
          target="_blank"
        >
          <Group gap="xs">
            {t`Go to collection`}
            <Icon name="external" />
          </Group>
        </Anchor>
      </Accordion.Panel>
    </Accordion.Item>
  );
};
