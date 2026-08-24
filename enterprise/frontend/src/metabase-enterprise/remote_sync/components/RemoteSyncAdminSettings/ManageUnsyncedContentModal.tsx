import { t } from "ttag";

import { useGetIcon } from "metabase/hooks/use-icon";
import {
  Anchor,
  Button,
  Card,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type {
  RemoteSyncDependencyFailure,
  RemoteSyncIneligibleDependency,
} from "metabase-types/api";

import type { UnsyncedContentGroup } from "../../utils";
import {
  getDependencyLocation,
  getDependencyUrl,
  getEntityKey,
  getGroupKey,
  getUnsyncedContentGroups,
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
  if (!failures?.length) {
    return null;
  }

  const groups = getUnsyncedContentGroups(failures);

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      padding="xl"
      size="lg"
      title={t`Manage unsynced content`}
    >
      <Stack gap="lg" pt="md">
        <Text>{t`The collections you’re syncing rely on content that isn’t synced. Each item is grouped by what needs it — open one to see it in a new tab.`}</Text>

        <Card withBorder p={0} shadow="none">
          <Stack gap={0} className={S.groupList}>
            {groups.map((group) => (
              <UnsyncedContentGroupSection
                key={getGroupKey(group.usedBy)}
                group={group}
              />
            ))}
          </Stack>
        </Card>

        <Group justify="end">
          <Button variant="filled" onClick={onClose}>{t`Back`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface UnsyncedContentGroupSectionProps {
  group: UnsyncedContentGroup;
}

const UnsyncedContentGroupSection = ({
  group: { usedBy, dependencies },
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
        />
      ))}
    </Stack>
  );
};

interface UnsyncedDependencyRowProps {
  dependency: RemoteSyncIneligibleDependency;
}

const UnsyncedDependencyRow = ({ dependency }: UnsyncedDependencyRowProps) => {
  const getIcon = useGetIcon();
  const location = getDependencyLocation(dependency);

  return (
    <Group
      className={S.dependencyRow}
      py="sm"
      px="md"
      gap="sm"
      justify="space-between"
      wrap="nowrap"
    >
      <Group gap="sm" wrap="nowrap" miw={0}>
        <Icon
          name={
            getIcon({
              model: dependency.model,
              id: dependency.id,
              display: dependency.display,
            }).name
          }
          c="text-secondary"
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
      </Group>
      {location != null && (
        <Text c="text-secondary" className={S.dependencyLocation}>
          {location}
        </Text>
      )}
    </Group>
  );
};
