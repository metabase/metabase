import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import {
  Button,
  Group,
  Icon,
  Loader,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import {
  EnterpriseApi,
  useCancelMetadataGenerationRunMutation,
  useGetMetadataGenerationRunQuery,
  useRetryFailedMetadataGenerationRunMutation,
} from "metabase-enterprise/api";
import type {
  MetadataGenerationRun,
  MetadataGenerationRunId,
} from "metabase-types/api";

import {
  RUN_POLLING_INTERVAL,
  canCancelRun,
  canRetryRun,
  canReviewRun,
  getRunEndTags,
  getRunStatusLabel,
  isRunActive,
} from "../../utils";

const MAX_TABLE_ERRORS = 5;

type RunProgressProps = {
  runId: MetadataGenerationRunId;
  onRetry?: (run: MetadataGenerationRun) => void;
  onReview?: () => void;
};

export function RunProgress({ runId, onRetry, onReview }: RunProgressProps) {
  const dispatch = useDispatch();
  const [isPolling, setIsPolling] = useState(true);
  const { data: run, error } = useGetMetadataGenerationRunQuery(runId, {
    pollingInterval: isPolling ? RUN_POLLING_INTERVAL : 0,
  });
  const isActive = run == null || isRunActive(run);
  const wasActive = useRef(isActive);

  useEffect(() => {
    setIsPolling(isActive);
    if (wasActive.current && !isActive) {
      dispatch(EnterpriseApi.util.invalidateTags(getRunEndTags()));
    }
    wasActive.current = isActive;
  }, [dispatch, isActive]);

  if (error) {
    return <Text c="feedback-negative">{getErrorMessage(error)}</Text>;
  }
  if (run == null) {
    return <Loader size="sm" />;
  }
  return <RunProgressView run={run} onRetry={onRetry} onReview={onReview} />;
}

type RunProgressViewProps = {
  run: MetadataGenerationRun;
  onRetry?: (run: MetadataGenerationRun) => void;
  onReview?: () => void;
};

function RunProgressView({ run, onRetry, onReview }: RunProgressViewProps) {
  const [cancelRun, { isLoading: isCanceling }] =
    useCancelMetadataGenerationRunMutation();
  const [retryRun, { isLoading: isRetrying }] =
    useRetryFailedMetadataGenerationRunMutation();
  const { sendErrorToast } = useMetadataToasts();

  const processed = run.done_tables + run.failed_tables;
  const percent =
    run.total_tables > 0 ? (processed / run.total_tables) * 100 : 0;
  const tableErrors = run.table_errors ?? [];

  const handleCancel = async () => {
    const { error } = await cancelRun(run.id);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to cancel the run`));
    }
  };

  const handleRetry = async () => {
    const { data, error } = await retryRun(run.id);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to retry the run`));
    } else if (data) {
      onRetry?.(data);
    }
  };

  return (
    <Stack gap="md" data-testid="metadata-generation-run">
      <Stack gap="xs">
        <Progress
          value={percent}
          color={run.failed_tables > 0 ? "feedback-warning" : "core-brand"}
          aria-label={t`Tables processed`}
        />
        <Group justify="space-between">
          <Text size="sm">
            {t`${processed} of ${run.total_tables} tables processed`}
          </Text>
          {run.failed_tables > 0 && (
            <Text size="sm" c="feedback-negative">
              {run.failed_tables === 1
                ? t`1 table failed`
                : t`${run.failed_tables} tables failed`}
            </Text>
          )}
        </Group>
      </Stack>

      {!isRunActive(run) && (
        <Text size="sm" fw="bold" data-testid="metadata-generation-run-status">
          {getRunStatusLabel(run.status)}
        </Text>
      )}

      {run.message && (
        <Text size="sm" c="text-secondary">
          {run.message}
        </Text>
      )}

      {tableErrors.length > 0 && (
        <Stack gap={4} data-testid="metadata-generation-table-errors">
          {tableErrors.slice(0, MAX_TABLE_ERRORS).map((tableError) => (
            <Group key={tableError.table_id} gap="xs" wrap="nowrap">
              <Icon name="warning" c="feedback-negative" size={12} />
              <Text size="sm" truncate>
                <strong>
                  {tableError.table_name ?? String(tableError.table_id)}
                </strong>
                {": "}
                {tableError.message}
              </Text>
            </Group>
          ))}
          {tableErrors.length > MAX_TABLE_ERRORS && (
            <Text size="sm" c="text-secondary">
              {t`and ${tableErrors.length - MAX_TABLE_ERRORS} more`}
            </Text>
          )}
        </Stack>
      )}

      <Group justify="flex-end" gap="sm">
        {canCancelRun(run) && (
          <Button
            variant="default"
            loading={isCanceling}
            onClick={handleCancel}
          >
            {t`Cancel`}
          </Button>
        )}
        {canRetryRun(run) && (
          <Button
            variant="default"
            leftSection={<Icon name="refresh" />}
            loading={isRetrying}
            onClick={handleRetry}
          >
            {t`Retry failed tables`}
          </Button>
        )}
        {onReview != null && canReviewRun(run) && (
          <Button variant="filled" onClick={onReview}>
            {t`Review suggestions`}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
