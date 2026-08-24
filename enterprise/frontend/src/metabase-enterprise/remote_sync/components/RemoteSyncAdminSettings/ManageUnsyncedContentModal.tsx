import { useFormikContext } from "formik";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import type { MoveCollectionDestination } from "metabase/common/collections/types";
import { ForwardRefLink } from "metabase/common/components/Link";
import type { OmniPickerCollectionItem } from "metabase/common/components/Pickers";
import { MoveModal } from "metabase/common/components/Pickers";
import { useToast } from "metabase/common/hooks";
import { useSetCollection } from "metabase/common/hooks/use-set-collection";
import { useGetIcon } from "metabase/hooks/use-icon";
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Group,
  Icon,
  Menu,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type {
  RemoteSyncDependencyFailure,
  RemoteSyncIneligibleDependency,
  RemoteSyncRemedyCollection,
} from "metabase-types/api";

import { COLLECTIONS_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import type { UnsyncedContentGroup } from "../../utils";
import {
  getDependencyCollectionUrl,
  getDependencyLocation,
  getDependencyUrl,
  getEntityKey,
  getGroupKey,
  getSyncableRemedyCollection,
  getUnsyncedContentGroups,
  toMovableItem,
} from "../../utils";

import S from "./ManageUnsyncedContentModal.module.css";

interface ManageUnsyncedContentModalProps {
  /** Why the last save was refused, one entry per collection. */
  failures?: RemoteSyncDependencyFailure[];
  isOpen: boolean;
  onClose: () => void;
}

export const ManageUnsyncedContentModal = ({
  failures,
  isOpen,
  onClose,
}: ManageUnsyncedContentModalProps) => {
  const setCollection = useSetCollection();
  const [sendToast] = useToast();
  const { values, setValues } = useFormikContext<RemoteSyncSettingsFormState>();
  const [movingDependency, setMovingDependency] =
    useState<RemoteSyncIneligibleDependency | null>(null);
  // Marked rather than removed, so the list doesn't shift under the admin mid-triage.
  const [movedKeys, setMovedKeys] = useState<ReadonlySet<string>>(new Set());
  // Kept by collection, not by row: switching one on covers every dependency that named it.
  const [syncedCollectionIds, setSyncedCollectionIds] = useState<
    ReadonlySet<number>
  >(new Set());

  useEffect(() => {
    setMovedKeys(new Set());
    setSyncedCollectionIds(new Set());
  }, [failures]);

  if (!failures?.length) {
    return null;
  }

  const groups = getUnsyncedContentGroups(failures);

  const handleMove = async (destination: MoveCollectionDestination) => {
    if (movingDependency == null) {
      return;
    }

    try {
      await setCollection(toMovableItem(movingDependency), destination);
    } catch (error) {
      // The picker doesn't catch a rejected move, and content in someone else's personal collection
      // is a plausible 403 — so report it here and leave the picker up to try elsewhere.
      sendToast({
        message: getErrorMessage(error, t`Couldn’t move this content`),
        icon: "warning",
      });
      return;
    }

    setMovedKeys((keys) => new Set(keys).add(getEntityKey(movingDependency)));
    setMovingDependency(null);
  };

  // Staged into the form rather than submitted, so several fixes ride along on one save.
  const handleSyncCollection = async ({ id }: RemoteSyncRemedyCollection) => {
    await setValues({
      ...values,
      [COLLECTIONS_KEY]: { ...values[COLLECTIONS_KEY], [id]: true },
    });
    setSyncedCollectionIds((ids) => new Set(ids).add(id));
  };

  return (
    <>
      <Modal
        opened={isOpen && movingDependency == null}
        onClose={onClose}
        padding="xl"
        size="lg"
        title={t`Manage unsynced content`}
      >
        <Stack gap="lg" pt="md">
          <Text>{t`The collections you’re syncing rely on content that isn’t synced. Each item is grouped by what needs it — open one to see it in a new tab, or move it somewhere that syncs.`}</Text>

          <Card withBorder p={0} shadow="none">
            <Stack gap={0} className={S.groupList}>
              {groups.map((group) => (
                <UnsyncedContentGroupSection
                  key={getGroupKey(group.usedBy)}
                  group={group}
                  movedKeys={movedKeys}
                  syncedCollectionIds={syncedCollectionIds}
                  onMove={setMovingDependency}
                  onSyncCollection={handleSyncCollection}
                />
              ))}
            </Stack>
          </Card>

          <Group justify="end">
            <Button variant="filled" onClick={onClose}>{t`Back`}</Button>
          </Group>
        </Stack>
      </Modal>

      {movingDependency != null && (
        <MoveModal
          title={t`Move "${movingDependency.name}"`}
          movingItem={toPickerItem(movingDependency)}
          canMoveToDashboard={false}
          onMove={handleMove}
          onClose={() => setMovingDependency(null)}
        />
      )}
    </>
  );
};

// Snippets live in their own namespace, which is what points the picker at snippet folders.
const toPickerItem = (
  dependency: RemoteSyncIneligibleDependency,
): OmniPickerCollectionItem => {
  const namespace = dependency.model === "snippet" ? "snippets" : undefined;

  return {
    id: dependency.id,
    name: dependency.name,
    model: dependency.model,
    namespace,
    collection: {
      id: dependency.collection?.id ?? "root",
      name: "",
      namespace,
    },
  };
};

interface UnsyncedContentGroupSectionProps {
  group: UnsyncedContentGroup;
  movedKeys: ReadonlySet<string>;
  syncedCollectionIds: ReadonlySet<number>;
  onMove: (dependency: RemoteSyncIneligibleDependency) => void;
  onSyncCollection: (collection: RemoteSyncRemedyCollection) => void;
}

const UnsyncedContentGroupSection = ({
  group: { usedBy, dependencies },
  movedKeys,
  syncedCollectionIds,
  onMove,
  onSyncCollection,
}: UnsyncedContentGroupSectionProps) => {
  const getIcon = useGetIcon();

  return (
    <Stack gap={0} className={S.group}>
      <Group
        className={S.groupHeader}
        bg="background-secondary"
        px="md"
        py="sm"
        gap="sm"
        wrap="nowrap"
      >
        {usedBy != null && (
          <Icon
            name={
              getIcon({
                model: usedBy.model,
                id: usedBy.id,
                display: usedBy.display,
              }).name
            }
            c="text-secondary"
          />
        )}
        <Text fw="bold" className={S.truncated}>
          {usedBy?.name ?? t`Other unsynced content`}
        </Text>
      </Group>
      {dependencies.map((dependency) => (
        <UnsyncedDependencyRow
          key={getEntityKey(dependency)}
          dependency={dependency}
          isMoved={movedKeys.has(getEntityKey(dependency))}
          syncedCollectionIds={syncedCollectionIds}
          onMove={onMove}
          onSyncCollection={onSyncCollection}
        />
      ))}
    </Stack>
  );
};

interface UnsyncedDependencyRowProps {
  dependency: RemoteSyncIneligibleDependency;
  isMoved: boolean;
  syncedCollectionIds: ReadonlySet<number>;
  onMove: (dependency: RemoteSyncIneligibleDependency) => void;
  onSyncCollection: (collection: RemoteSyncRemedyCollection) => void;
}

const UnsyncedDependencyRow = ({
  dependency,
  isMoved,
  syncedCollectionIds,
  onMove,
  onSyncCollection,
}: UnsyncedDependencyRowProps) => {
  const getIcon = useGetIcon();
  const location = getDependencyLocation(dependency);
  const collectionHref = getDependencyCollectionUrl(dependency);
  const remedyCollection = getSyncableRemedyCollection(dependency);
  const willSync =
    remedyCollection != null && syncedCollectionIds.has(remedyCollection.id);
  const isResolved = isMoved || willSync;

  return (
    <Group
      className={S.dependencyRow}
      py="sm"
      px="md"
      gap="sm"
      justify="space-between"
      wrap="nowrap"
    >
      <Group gap="sm" wrap="nowrap" miw={0} align="baseline">
        <Icon
          name={
            isResolved
              ? "check"
              : getIcon({
                  model: dependency.model,
                  id: dependency.id,
                  display: dependency.display,
                }).name
          }
          c={isResolved ? "feedback-positive" : "text-secondary"}
          className={S.dependencyIcon}
        />
        <Anchor
          href={getDependencyUrl(dependency)}
          target="_blank"
          fw="medium"
          td="none"
          className={S.truncated}
        >
          {dependency.name}
        </Anchor>
        {location != null && (
          <Text c="text-secondary" size="xs" className={S.dependencyLocation}>
            {location}
          </Text>
        )}
      </Group>

      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" aria-label={t`Actions`}>
            <Icon name="ellipsis" c="text-secondary" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="move" />}
            onClick={() => onMove(dependency)}
          >
            {t`Move to another collection`}
          </Menu.Item>
          {remedyCollection != null && (
            <Menu.Item
              leftSection={<Icon name="sync" />}
              disabled={willSync}
              onClick={() => onSyncCollection(remedyCollection)}
            >
              {t`Sync ${remedyCollection.name}`}
            </Menu.Item>
          )}
          {collectionHref != null && location != null && (
            <>
              <Menu.Divider />
              <Menu.Item
                component={ForwardRefLink}
                to={collectionHref}
                target="_blank"
                leftSection={<Icon name="folder" />}
              >
                {t`Go to ${location}`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
};
