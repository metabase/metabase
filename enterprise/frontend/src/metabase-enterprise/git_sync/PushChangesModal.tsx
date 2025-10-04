import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api/collection";
import { useAdminSetting } from "metabase/api/utils";
import { getIcon } from "metabase/lib/icon";
import { collection as collectionUrl, modelToUrl } from "metabase/lib/urls";
import {
  Alert,
  Anchor,
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
  type CollectionPathSegment,
  buildCollectionMap,
  getCollectionPathSegments,
  getSyncStatusColor,
  getSyncStatusIcon,
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

interface CollectionPathProps {
  segments: CollectionPathSegment[];
}

const CollectionPath = ({ segments }: CollectionPathProps) => {
  return (
    <Group gap="sm" wrap="wrap">
      {segments.map((segment, index) => (
        <Fragment key={segment.id}>
          {index > 0 && (
            <Text size="sm" c="text-secondary">
              /
            </Text>
          )}
          <Anchor
            href={collectionUrl({
              id: segment.id,
              name: segment.name,
            })}
            target="_blank"
            size="sm"
            c="text-secondary"
            td="none"
          >
            {segment.name}
          </Anchor>
        </Fragment>
      ))}
    </Group>
  );
};

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

  const statusIcon = getSyncStatusIcon(entity.sync_status);
  const statusColor = getSyncStatusColor(entity.sync_status);

  return (
    <Group gap="sm" wrap="nowrap" px="sm" className={S.entityLink}>
      <Anchor
        href={url}
        target="_blank"
        size="sm"
        c="text-secondary"
        td="none"
        classNames={{ root: S.anchor }}
        display="flex"
      >
        <Icon
          name={entityIcon.name}
          size={16}
          mr="sm"
          c="text-secondary"
          className={S.icon}
        />
        {entity.name}
      </Anchor>
      <Icon name={statusIcon} size={16} c={statusColor} ml="auto" />
    </Group>
  );
};

interface AllChangesViewProps {
  entities: DirtyEntity[];
  collections: Collection[];
  title?: string;
}

const AllChangesView = ({
  entities,
  collections,
  title,
}: AllChangesViewProps) => {
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

  const groupedData = useMemo(() => {
    const byCollection = _.groupBy(entities, (e) => e.collection_id || 0);

    const result = Object.entries(byCollection)
      .map(([collectionId, items]) => {
        const collectionEntity = items.find(
          (item) =>
            item.model === "collection" && item.id === Number(collectionId),
        );
        const nonCollectionItems = items.filter(
          (item) =>
            !(item.model === "collection" && item.id === Number(collectionId)),
        );

        return {
          pathSegments: getCollectionPathSegments(
            Number(collectionId) || undefined,
            collectionMap,
          ),
          collectionId: Number(collectionId) || undefined,
          collectionEntity,
          items: nonCollectionItems.sort((a, b) => {
            const statusOrderA = SYNC_STATUS_ORDER.indexOf(a.sync_status);
            const statusOrderB = SYNC_STATUS_ORDER.indexOf(b.sync_status);
            if (statusOrderA !== statusOrderB) {
              return statusOrderA - statusOrderB;
            }
            return a.name.localeCompare(b.name);
          }),
        };
      })
      .sort((a, b) =>
        a.pathSegments
          .map((s) => s.name)
          .join(" / ")
          .localeCompare(b.pathSegments.map((s) => s.name).join(" / ")),
      );

    return result;
  }, [entities, collectionMap]);

  return (
    <Box>
      <Title order={4} mb="md" c="text-secondary">
        {title ?? t`Changes to push`}
      </Title>

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
          {groupedData.map((group, groupIndex) => (
            <Fragment key={group.collectionId}>
              {groupIndex > 0 && <Divider />}
              <Box p="md">
                <Group
                  p="sm"
                  gap="sm"
                  mb={group.items.length > 0 ? "12px" : 0}
                  bg="bg-light"
                  bdrs="md"
                >
                  <Icon name="synced_collection" size={16} c="text-secondary" />
                  <CollectionPath segments={group.pathSegments} />
                  {group.collectionEntity && (
                    <Icon
                      name={getSyncStatusIcon(
                        group.collectionEntity.sync_status,
                      )}
                      size={16}
                      c={getSyncStatusColor(group.collectionEntity.sync_status)}
                      ml="auto"
                    />
                  )}
                </Group>
                {group.items.length > 0 && (
                  <Stack
                    gap="12px"
                    ml="md"
                    pl="xs"
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
                )}
              </Box>
            </Fragment>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

interface ChangesListsProps {
  collections: Collection[];
  title?: string;
}

export const ChangesLists = ({ collections, title }: ChangesListsProps) => {
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

  return (
    <AllChangesView
      entities={allEntities}
      collections={collections}
      title={title}
    />
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
