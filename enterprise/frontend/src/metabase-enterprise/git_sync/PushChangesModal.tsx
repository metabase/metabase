import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api/collection";
import { useAdminSetting } from "metabase/api/utils";
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
  Group,
  Icon,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  type DirtyEntity,
  useExportChangesMutation,
  useGetChangedEntitiesQuery,
} from "../api/git-sync";

import S from "./PushChangesModal.module.css";
import {
  buildCollectionMap,
  getCollectionFullPath,
  getSyncStatusBackgroundColor,
  getSyncStatusColor,
  getSyncStatusIcon,
  getSyncStatusLabel,
  groupEntitiesBySyncStatus,
  parseExportError,
} from "./utils";

interface PushChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
}

const SYNC_STATUS_ORDER: DirtyEntity["sync_status"][] = [
  "create",
  "update",
  "touch",
  "delete",
];

interface EntityLinkProps {
  entity: DirtyEntity;
}

const EntityLink = ({ entity }: EntityLinkProps) => {
  const entityIcon = getIcon({
    model: entity.model,
    id: entity.id,
    display: entity.display,
  });

  const url = useMemo(() => modelToUrl(entity), [entity]);

  if (url == null) {
    return null;
  }

  return (
    <Group gap="xs" wrap="nowrap" px="sm" className={S.entityLink}>
      <Icon
        name={entityIcon.name}
        size={16}
        c="text-primary"
        className={S.icon}
      />
      <Anchor
        href={url}
        target="_blank"
        size="sm"
        c="text-primary"
        fw="bold"
        td="none"
        classNames={{ root: S.anchor }}
      >
        {entity.name}
      </Anchor>
    </Group>
  );
};

interface AllChangesViewProps {
  entities: DirtyEntity[];
  collections: Collection[];
}

const AllChangesView = ({ entities, collections }: AllChangesViewProps) => {
  const { data: collectionTree = [] } = useListCollectionsTreeQuery();

  const collectionMap = useMemo(() => {
    const map = buildCollectionMap(collectionTree);

    collections.forEach((c) => {
      if (typeof c.id === "number" && !map.has(c.id)) {
        map.set(c.id, c);
      }
    });

    return map;
  }, [collectionTree, collections]);

  const groupedByStatus = groupEntitiesBySyncStatus(entities);

  const groupedData = useMemo(() => {
    const result: Array<{
      status: DirtyEntity["sync_status"];
      groups: Array<{
        path: string;
        collectionId: number | undefined;
        items: DirtyEntity[];
      }>;
    }> = [];

    SYNC_STATUS_ORDER.forEach((status) => {
      const items = groupedByStatus[status];
      if (!items || items.length === 0) {
        return;
      }

      const byCollection = _.groupBy(items, (e) => e.collection_id || 0);

      const pathGroups = Object.entries(byCollection)
        .map(([collectionId, entities]) => ({
          path: getCollectionFullPath(
            Number(collectionId) || undefined,
            collectionMap,
          ),
          collectionId: Number(collectionId) || undefined,
          items: entities,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

      result.push({
        status,
        groups: pathGroups,
      });
    });

    return result;
  }, [groupedByStatus, collectionMap]);

  const totalChanges = entities.length;

  return (
    <Box>
      <Group gap="xs" mb="md" align="end">
        <Title order={4} mr="sm" c="text-dark">
          {t`Changes to push`}
        </Title>
        <Badge
          size="md"
          px="sm"
          variant="light"
          style={{ textTransform: "none" }}
        >
          {ngettext(
            msgid`${totalChanges} item`,
            `${totalChanges} items`,
            totalChanges,
          )}
        </Badge>
      </Group>

      <Paper
        withBorder
        radius="md"
        mah={400}
        styles={{
          root: {
            overflowY: "auto",
          },
        }}
      >
        <Stack gap={0}>
          {groupedData.map(({ status, groups }, statusIndex) => (
            <Fragment key={status}>
              {statusIndex > 0 && <Divider />}
              <Box pb="md">
                <Box p="md" pb="md">
                  <Group
                    gap="xs"
                    p="sm"
                    bdrs="md"
                    bg={getSyncStatusBackgroundColor(status)}
                  >
                    <Icon
                      name={getSyncStatusIcon(status)}
                      size={14}
                      c={getSyncStatusColor(status)}
                    />
                    <Text
                      fw={600}
                      size="sm"
                      c={getSyncStatusColor(status)}
                      lh="md"
                    >
                      {getSyncStatusLabel(status)}
                    </Text>
                    <Text
                      size="xs"
                      c={getSyncStatusColor(status)}
                      ml="auto"
                      lh="md"
                      px="sm"
                      fw="bold"
                    >
                      {groups.reduce((sum, g) => sum + g.items.length, 0)}
                    </Text>
                  </Group>
                </Box>

                {groups.map((group) => (
                  <Box key={`${status}-${group.collectionId}`}>
                    <Box px="md" pb="sm">
                      <Group px="sm" gap="xs" mb="sm">
                        <Icon name="folder" size={16} c="text-medium" />
                        <Text size="sm" c="text-medium" lh="md">
                          {group.path}
                        </Text>
                      </Group>
                      <Stack
                        gap="sm"
                        ml="md"
                        pl="sm"
                        style={{
                          borderLeft: "2px solid var(--mb-color-border)",
                        }}
                      >
                        {group.items.map((entity) => (
                          <EntityLink
                            key={`${entity.model}-${entity.id}`}
                            entity={entity}
                          />
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Fragment>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export const ChangesLists = ({
  collections,
}: {
  collections: Collection[];
}) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetChangedEntitiesQuery(undefined, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    });

  if (isLoadingChanges) {
    return (
      <Box>
        <Loader size="sm" />
      </Box>
    );
  }

  const allEntities = dirtyData?.dirty || [];

  if (allEntities.length === 0) {
    return (
      <Box ta="center" py="xl">
        <Text c="text-light" size="sm">
          {t`No changes to push`}
        </Text>
      </Box>
    );
  }

  return <AllChangesView entities={allEntities} collections={collections} />;
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
    <Textarea
      value={value}
      label={<Text mb="xs">{t`Describe your changes`}</Text>}
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
    <Text size="xs" c="text-medium" mt="sm">
      {t`This message will be visible in your Git history`}
    </Text>
  </Box>
);

export const PushChangesModal = ({
  isOpen,
  onClose,
  collections,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");
  const [forceMode, setForceMode] = useState(false);
  const { value: currentBranch, updateSetting } =
    useAdminSetting("remote-sync-branch");

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
    if (!currentBranch) {
      throw new Error("Current branch is not set");
    }

    exportChanges({
      message: commitMessage.trim() || undefined,
      forceSync: forceMode,
      branch: currentBranch,
    });
    updateSetting({
      key: "remote-sync-branch",
      value: currentBranch,
    });
  }, [commitMessage, forceMode, exportChanges, currentBranch, updateSetting]);

  return (
    <Modal
      opened={isOpen}
      title={<Title fw={600} order={3} pl="sm">{t`Push to Git`}</Title>}
      onClose={onClose}
      size="lg"
      styles={{
        body: { padding: 0 },
      }}
    >
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
          <ChangesLists collections={collections} />

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

        <Group gap="sm" justify="end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            color={forceMode ? "warning" : "brand"}
            onClick={handlePush}
            disabled={isPushing}
            loading={isPushing}
            leftSection={
              forceMode ? <Icon name="warning" /> : <Icon name="upload" />
            }
          >
            {forceMode ? t`Force push` : t`Push changes`}
          </Button>
        </Group>
      </Box>
    </Modal>
  );
};
