import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useGetDatabaseQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { getUserIsAdmin } from "metabase/current-user";
import type { MetadataGenerationDatabasePaneProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { useListMetadataGenerationRunsQuery } from "metabase-enterprise/api";

import { isRunActive } from "../../utils";
import { GenerateMetadataModal } from "../GenerateMetadataModal";
import { RunProgress } from "../RunProgress";

import S from "./DatabasePane.module.css";

export function DatabasePane({
  databaseId,
}: MetadataGenerationDatabasePaneProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: database } = useGetDatabaseQuery({ id: databaseId });

  return (
    <Stack gap="lg" pb="xl" data-testid="database-pane">
      <Group gap="sm" wrap="nowrap">
        <Icon name="database" c="text-secondary" />
        <Title order={3}>{database?.name ?? ""}</Title>
      </Group>
      {isAdmin && <MetadataGenerationSection databaseId={databaseId} />}
    </Stack>
  );
}

function MetadataGenerationSection({
  databaseId,
}: MetadataGenerationDatabasePaneProps) {
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure();
  const {
    data: runs,
    error,
    isLoading,
  } = useListMetadataGenerationRunsQuery({ database_id: databaseId });
  const latestRun = runs?.[0];
  const hasActiveRun = latestRun != null && isRunActive(latestRun);

  return (
    <Stack gap="lg" className={S.box} data-testid="metadata-generation-section">
      <Stack gap="xs">
        <Title order={4} fz="sm" c="text-secondary">
          {t`AI metadata`}
        </Title>
        <Text size="sm" c="text-secondary">
          {t`Use AI to propose data sensitivity, semantic types and descriptions for the fields of this database.`}
        </Text>
      </Stack>

      {isLoading ? (
        <Loader size="sm" />
      ) : error ? (
        <Text c="error">{getErrorMessage(error)}</Text>
      ) : latestRun ? (
        <Stack gap="xs">
          <Text fw="bold" size="sm">{t`Latest run`}</Text>
          <RunProgress key={latestRun.id} runId={latestRun.id} />
        </Stack>
      ) : (
        <Text size="sm">{t`No metadata has been generated for this database yet.`}</Text>
      )}

      <Group>
        <Tooltip
          label={t`A run is already in progress for this database.`}
          disabled={!hasActiveRun}
        >
          <Button
            variant="filled"
            leftSection={<Icon name="sparkles" />}
            disabled={hasActiveRun}
            onClick={openModal}
          >
            {t`Generate metadata`}
          </Button>
        </Tooltip>
      </Group>

      <GenerateMetadataModal
        databaseId={databaseId}
        opened={isModalOpen}
        onClose={closeModal}
      />
    </Stack>
  );
}
