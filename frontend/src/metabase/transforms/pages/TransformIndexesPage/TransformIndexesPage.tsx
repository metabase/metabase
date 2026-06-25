import { useEffect, useState } from "react";
import { t } from "ttag";

import { useListTableIndexesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { useTransformWithPolling } from "metabase/transforms/hooks/use-transform-with-polling";
import { isTransformRunning } from "metabase/transforms/utils";
import { Button, Center, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  RequestableIndexes,
  TableId,
  TableIndexEntry,
  TableIndexRequestStatus,
  TransformId,
} from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";

import { CreateIndexModal } from "./CreateIndexModal";
import { IndexTable } from "./IndexTable";

// Poll the list while any managed index is still working its way to a terminal
// state, so newly created indexes update without a manual refresh.
const POLL_INTERVAL = 5000;

const IN_PROGRESS_STATUSES: TableIndexRequestStatus[] = [
  "create-pending",
  "update-pending",
  "deletion-pending",
  "running",
];

function hasIndexInProgress(indexes: TableIndexEntry[]): boolean {
  return indexes.some(
    (index) =>
      index.request != null &&
      IN_PROGRESS_STATUSES.includes(index.request.status),
  );
}

export type TransformIndexesPageParams = {
  transformId: string;
};

type TransformIndexesPageProps = {
  params?: TransformIndexesPageParams;
};

export function TransformIndexesPage({ params }: TransformIndexesPageProps) {
  const id = Urls.extractEntityId(params?.transformId);
  const {
    transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useTransformWithPolling(id ?? undefined);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (id == null || transform == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-indexes-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <TransformIndexesContent
        transformId={transform.id}
        tableId={transform.table?.id ?? null}
        requestableIndexes={transform.requestable_indexes}
        readOnly={readOnly}
        isTransformRunning={isTransformRunning(transform)}
      />
    </PageContainer>
  );
}

type TransformIndexesContentProps = {
  transformId: TransformId;
  tableId: TableId | null;
  requestableIndexes?: RequestableIndexes | null;
  readOnly?: boolean;
  isTransformRunning: boolean;
};

function TransformIndexesContent({
  transformId,
  tableId,
  requestableIndexes,
  readOnly,
  isTransformRunning,
}: TransformIndexesContentProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(0);
  const {
    data: indexes = [],
    isLoading,
    error,
  } = useListTableIndexesQuery(
    { "transform-id": transformId },
    { pollingInterval },
  );

  useEffect(() => {
    setPollingInterval(hasIndexInProgress(indexes) ? POLL_INTERVAL : 0);
  }, [indexes]);

  if (isLoading || error != null) {
    return (
      <Center flex={1}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const canCreateIndexes =
    requestableIndexes != null && Object.keys(requestableIndexes).length > 0;

  return (
    <Stack flex={1} gap="md">
      <Group justify="flex-end">
        <Button
          variant="filled"
          disabled={readOnly || !canCreateIndexes}
          onClick={() => setIsCreateOpen(true)}
        >
          {t`Create index`}
        </Button>
      </Group>
      <IndexTable
        indexes={indexes}
        isTransformRunning={isTransformRunning}
        tableId={tableId}
        requestableIndexes={requestableIndexes}
        readOnly={readOnly}
      />
      {isCreateOpen && (
        <CreateIndexModal
          transformId={transformId}
          tableId={tableId}
          requestableIndexes={requestableIndexes}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </Stack>
  );
}
