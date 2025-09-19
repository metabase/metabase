import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
} from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  type DirtyEntity,
  useExportChangesMutation,
  useGetCollectionDirtyEntitiesQuery,
} from "../api/git-sync";

import {
  getSyncStatusColor,
  getSyncStatusIcon,
  getSyncStatusLabel,
  groupEntitiesBySyncStatus,
  parseExportError,
} from "./utils";

interface PushChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: Collection;
}

const SYNC_STATUS_ORDER: DirtyEntity["sync_status"][] = [
  "create",
  "update",
  "touch",
  "delete",
];

interface ModalTitleProps {
  children: React.ReactNode;
}

const ModalTitle = ({ children }: ModalTitleProps) => (
  <Group gap="xs">
    <Icon name="upload" size={20} />
    <Text fw={600}>{children}</Text>
  </Group>
);

interface EntityLinkProps {
  entity: DirtyEntity;
}

const EntityLink = ({ entity }: EntityLinkProps) => {
  const entityIcon = getIcon({
    model: entity.model,
    id: entity.id,
    display: entity.display,
  });

  return (
    <Group gap="xs" ml="md">
      <Icon name={entityIcon.name} size={14} c="text-light" />
      <Anchor
        href={modelToUrl(entity) || "#"}
        target="_blank"
        size="sm"
        c="text-dark"
        fw={500}
        td="none"
        styles={{
          root: {
            "&:hover": {
              textDecoration: "underline",
            },
          },
        }}
      >
        {entity.name}
      </Anchor>
    </Group>
  );
};

interface SyncStatusGroupProps {
  syncStatus: DirtyEntity["sync_status"];
  entities: DirtyEntity[];
  showDivider: boolean;
}

const SyncStatusGroup = ({
  syncStatus,
  entities,
  showDivider,
}: SyncStatusGroupProps) => (
  <Box key={syncStatus}>
    {showDivider && <Divider />}
    <Box p="md">
      <Group gap="sm" mb="sm">
        <Icon
          name={getSyncStatusIcon(syncStatus)}
          size={16}
          c={getSyncStatusColor(syncStatus)}
        />
        <Text fw={600} size="sm">
          {getSyncStatusLabel(syncStatus)}
        </Text>
        <Badge size="xs" variant="light" color={getSyncStatusColor(syncStatus)}>
          {entities.length}
        </Badge>
      </Group>
      <Stack gap="xs">
        {entities.map((entity) => (
          <EntityLink key={`${entity.model}-${entity.id}`} entity={entity} />
        ))}
      </Stack>
    </Box>
  </Box>
);

interface ChangesListProps {
  entities: DirtyEntity[];
}

const ChangesList = ({ entities }: ChangesListProps) => {
  const groupedEntities = groupEntitiesBySyncStatus(entities);

  const getStatusPriority = (status: string): number => {
    const index = SYNC_STATUS_ORDER.indexOf(
      status as DirtyEntity["sync_status"],
    );
    return index >= 0 ? index : SYNC_STATUS_ORDER.length;
  };

  const sortedGroups = Object.entries(groupedEntities).sort(
    ([statusA], [statusB]) => {
      return getStatusPriority(statusA) - getStatusPriority(statusB);
    },
  );

  return (
    <Box>
      <Group gap="xs" mb="md">
        <Text fw={600} size="sm">
          {t`What's changing`}
        </Text>
        <Badge size="sm" variant="light">
          {ngettext(
            msgid`${entities.length} item`,
            `${entities.length} items`,
            entities.length,
          )}
        </Badge>
      </Group>

      <Paper
        withBorder
        radius="md"
        mah={300}
        styles={{
          root: {
            overflowY: "auto",
          },
        }}
      >
        <Stack gap={0}>
          {sortedGroups.map(([syncStatus, items], groupIndex) => (
            <SyncStatusGroup
              key={syncStatus}
              syncStatus={syncStatus as DirtyEntity["sync_status"]}
              entities={items}
              showDivider={groupIndex > 0}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

interface CommitMessageSectionProps {
  value: string;
  onChange: (value: string) => void;
}

const CommitMessageSection = ({
  value,
  onChange,
}: CommitMessageSectionProps) => (
  <Box>
    <Text fw={600} size="sm" mb="xs">
      {t`Describe your changes`}
    </Text>
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t`What did you change and why?`}
      minRows={3}
      maxRows={5}
      styles={{
        input: {
          fontSize: "14px",
        },
      }}
    />
    <Text size="xs" c="text-light" mt="xs">
      {t`This message will be visible in your Git history`}
    </Text>
  </Box>
);

interface LoadingStateProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoadingState = ({ isOpen, onClose }: LoadingStateProps) => (
  <Modal
    opened={isOpen}
    title={<ModalTitle>{t`Push to Git`}</ModalTitle>}
    onClose={onClose}
    size="lg"
  >
    <Flex justify="center" align="center" py={60}>
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="text-medium" size="sm">
          {t`Loading your changes...`}
        </Text>
      </Stack>
    </Flex>
  </Modal>
);

interface EmptyStateProps {
  onClose: () => void;
}

const EmptyState = ({ onClose }: EmptyStateProps) => (
  <Stack align="center" py={60} px="xl">
    <Icon name="check" size={48} c="success" />
    <Stack align="center" gap="xs">
      <Text fw={600} size="lg">
        {t`All caught up!`}
      </Text>
      <Text c="text-medium" size="sm" ta="center">
        {t`Your collection is already in sync with the remote repository.`}
      </Text>
    </Stack>
    <Button mt="lg" onClick={onClose}>
      {t`Close`}
    </Button>
  </Stack>
);

export const PushChangesModal = ({
  isOpen,
  onClose,
  collection,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");
  const [forceMode, setForceMode] = useState(false);
  const branch = useSetting("remote-sync-branch");

  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetCollectionDirtyEntitiesQuery(
      { collectionId: collection.id },
      {
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
      },
    );

  const [
    exportChanges,
    { isLoading: isPushing, error: exportError, isSuccess },
  ] = useExportChangesMutation();

  const { errorMessage, hasConflict } = useMemo(
    () => parseExportError(exportError),
    [exportError],
  );

  useEffect(() => {
    if (hasConflict) {
      setForceMode(true);
    }
  }, [hasConflict]);

  useEffect(() => {
    if (isSuccess) {
      onClose();
    }
  }, [isSuccess, onClose]);

  const handlePush = useCallback(() => {
    exportChanges({
      message: commitMessage.trim() || undefined,
      collection: collection.id,
      forceSync: forceMode,
    });
  }, [commitMessage, collection.id, forceMode, exportChanges]);

  const entities = dirtyData?.dirty || [];
  const hasChanges = entities.length > 0;

  if (isLoadingChanges) {
    return <LoadingState isOpen={isOpen} onClose={onClose} />;
  }

  return (
    <Modal
      opened={isOpen}
      title={<ModalTitle>{t`Push to Git`}</ModalTitle>}
      onClose={onClose}
      size="lg"
      styles={{
        body: { padding: 0 },
      }}
    >
      {!hasChanges ? (
        <EmptyState onClose={onClose} />
      ) : (
        <>
          <Box px="xl" pt="md">
            {errorMessage && (
              <Alert
                mb="md"
                variant={hasConflict ? "warning" : "error"}
                icon={<Icon name={hasConflict ? "info" : "warning"} />}
              >
                {errorMessage}
              </Alert>
            )}

            <Stack gap="lg">
              <ChangesList entities={entities} />
              <CommitMessageSection
                value={commitMessage}
                onChange={setCommitMessage}
              />
            </Stack>
          </Box>

          <Divider my="lg" />

          <Box px="xl" pb="lg">
            {hasConflict && (
              <Card bg="warning-light" p="sm" mb="md">
                <Group gap="xs">
                  <Icon name="warning" c="warning" />
                  <Text size="sm" c="warning-dark">
                    {t`Force pushing will replace the remote version with your changes`}
                  </Text>
                </Group>
              </Card>
            )}

            <Flex justify={branch ? "space-between" : "end"} align="center">
              {branch && (
                <Text size="sm" c="text-medium">
                  {branch}
                </Text>
              )}

              <Group gap="sm">
                <Button variant="subtle" onClick={onClose}>
                  {t`Cancel`}
                </Button>
                <Button
                  variant="filled"
                  color={forceMode ? "warning" : "brand"}
                  onClick={handlePush}
                  disabled={isPushing || !hasChanges}
                  loading={isPushing}
                  leftSection={
                    forceMode ? <Icon name="warning" /> : <Icon name="upload" />
                  }
                >
                  {forceMode ? t`Force push` : t`Push changes`}
                </Button>
              </Group>
            </Flex>
          </Box>
        </>
      )}
    </Modal>
  );
};
