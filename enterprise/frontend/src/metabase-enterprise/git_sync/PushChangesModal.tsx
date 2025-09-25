import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls";
import {
  Alert,
  Anchor,
  Autocomplete,
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
  useGetBranchesQuery,
  useGetChangedEntitiesQuery,
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
  collections: Collection[];
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
}

const SyncStatusGroup = ({ syncStatus, entities }: SyncStatusGroupProps) => (
  <Box key={syncStatus}>
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

const ChangesLists = ({ collections }: { collections: Collection[] }) => {
  return (
    <Box>
      {collections.map((collection, idx) => (
        <Fragment key={collection.id}>
          {idx > 0 && <Divider my="lg" />}
          <ChangesList collection={collection} />
        </Fragment>
      ))}
    </Box>
  );
};

const ChangesList = ({ collection }: { collection: Collection }) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetChangedEntitiesQuery(
      undefined,
      {
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
      },
    );

  if (isLoadingChanges) {
    return (
      <Box>
        <Loader size="sm" />
      </Box>
    );
  }

  const entities = dirtyData?.dirty || [];
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

  const hasChanges = entities.length > 0;

  return (
    <Box>
      <Group gap="xs" mb="md" align="end">
        <Title order={3} mr="sm">
          {collection.name}
        </Title>
        <Badge size="sm" variant="light">
          {ngettext(
            msgid`${entities.length} item changed`,
            `${entities.length} items changed`,
            entities.length,
          )}
        </Badge>
      </Group>
      {hasChanges && (
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
            {sortedGroups.map(([syncStatus, items]) => (
              <SyncStatusGroup
                key={syncStatus}
                syncStatus={syncStatus as DirtyEntity["sync_status"]}
                entities={items}
              />
            ))}
          </Stack>
        </Paper>
      )}
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
    <Textarea
      value={value}
      label={t`Describe your changes`}
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

export const PushChangesModal = ({
  isOpen,
  onClose,
  collections,
}: PushChangesModalProps) => {
  const [commitMessage, setCommitMessage] = useState("");
  const [forceMode, setForceMode] = useState(false);
  const { value: defaultBranch, updateSetting } =
    useAdminSetting("remote-sync-branch");
  const { data: branchData } = useGetBranchesQuery();
  const [branch, setBranch] = useState(defaultBranch);

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
      forceSync: forceMode,
      branch: branch ?? "main",
    });
    updateSetting({
      key: "remote-sync-branch",
      value: branch ?? "main",
    });
  }, [commitMessage, forceMode, exportChanges, branch, updateSetting]);

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
          <Autocomplete
            data={branchData?.items || []}
            value={branch ?? "main"}
            onChange={setBranch}
            label={t`Select branch`}
            limit={5}
          />
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
