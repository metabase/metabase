import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useCancelCurrentTransformRunMutation,
  useListDagRunTransformRunsQuery,
  useRunTransformDagMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { POLLING_INTERVAL } from "metabase/transforms/constants";
import {
  Anchor,
  Box,
  Card,
  Divider,
  Group,
  Icon,
  Menu,
  Stack,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isResourceNotFoundError } from "metabase/utils/errors";
import type {
  Transform,
  TransformDagDirection,
  TransformDagRunId,
  TransformTagId,
} from "metabase-types/api";

import {
  trackTransformRunTagsUpdated,
  trackTransformTriggerDagRun,
  trackTransformTriggerManualRun,
} from "../../../analytics";
import { RunButton } from "../../../components/RunButton";
import { RunStatus } from "../../../components/RunStatus";
import { TagMultiSelect } from "../../../components/TagMultiSelect";

import { LogOutput } from "./LogOutput";
import { RunDagConfirmModal } from "./RunDagConfirmModal";

type RunSectionProps = {
  transform: Transform;
  readOnly?: boolean;
  noTitle?: boolean;
};

function useScheduledDagRun(transform: Transform) {
  const [scheduledDagRunId, setScheduledDagRunId] =
    useState<TransformDagRunId | null>(null);

  const { data: members, error } = useListDagRunTransformRunsQuery(
    scheduledDagRunId != null ? { dagRunId: scheduledDagRunId } : skipToken,
    {
      pollingInterval: scheduledDagRunId != null ? POLLING_INTERVAL : undefined,
    },
  );

  const dagFinished =
    members != null &&
    members.length > 0 &&
    !members.some(
      (run) => run.status === "started" || run.status === "canceling",
    );

  const dagUnavailable = error != null;

  useEffect(() => {
    if (scheduledDagRunId != null && (dagFinished || dagUnavailable)) {
      setScheduledDagRunId(null);
    }
  }, [scheduledDagRunId, dagFinished, dagUnavailable]);

  const runStatus = transform.last_run?.status;
  const isRunningNow = runStatus === "started" || runStatus === "canceling";

  const schedule = useCallback(
    (dagRunId: TransformDagRunId) => setScheduledDagRunId(dagRunId),
    [],
  );

  return {
    isScheduled:
      scheduledDagRunId != null &&
      !dagFinished &&
      !dagUnavailable &&
      !isRunningNow,
    schedule,
  };
}

export function RunSection({ transform, readOnly, noTitle }: RunSectionProps) {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { isScheduled, schedule } = useScheduledDagRun(transform);

  const content = (
    <>
      <Stack>
        <Group p="lg" justify="space-between">
          <RunStatusSection transform={transform} isScheduled={isScheduled} />
          <RunButtonSection
            transform={transform}
            readOnly={readOnly}
            onScheduled={schedule}
          />
        </Group>
        <RunOutputSection transform={transform} />
      </Stack>
      <Divider />
      <Group p="lg" gap="lg">
        <Stack gap="sm">
          <Box fw="bold">{t`Run it on a schedule with tags`}</Box>
          <Box>{t`Jobs will run all transforms with their tags.`}</Box>
        </Stack>
        <TagSection
          transform={transform}
          readOnly={readOnly || isRemoteSyncReadOnly}
        />
      </Group>
    </>
  );

  if (noTitle) {
    return (
      <Card p={0} shadow="none" withBorder>
        {content}
      </Card>
    );
  }

  return (
    <TitleSection
      label={t`Run this transform`}
      description={t`This transform will be run whenever the jobs it belongs to are scheduled.`}
    >
      {content}
    </TitleSection>
  );
}

type RunStatusSectionProps = {
  transform: Transform;
  isScheduled: boolean;
};

function RunStatusSection({ transform, isScheduled }: RunStatusSectionProps) {
  const { id, last_run } = transform;

  const status = last_run?.status;
  const previousStatus = usePrevious(status);

  const runExtra = status === "succeeded" && previousStatus === "canceling" && (
    <Box
      c="text-disabled"
      ml="lg"
    >{t`This run succeeded before it had a chance to cancel.`}</Box>
  );

  if (isScheduled) {
    return (
      <Group gap="sm" data-testid="run-status">
        <Icon c="text-secondary" name="clock" />
        <Box>{t`Scheduled to run as part of a reprocess run.`}</Box>
      </Group>
    );
  }

  return (
    <Stack gap={0}>
      <RunStatus
        run={last_run ?? null}
        neverRunMessage={t`This transform hasn't been run before.`}
        runInfo={
          <Anchor
            key="link"
            component={Link}
            to={Urls.transformRunList({ transformIds: [id] })}
            lh="inherit"
          >
            {t`See all runs`}
          </Anchor>
        }
      />
      {runExtra}
    </Stack>
  );
}

type RunButtonSectionProps = {
  transform: Transform;
  readOnly?: boolean;
  onScheduled: (dagRunId: TransformDagRunId) => void;
};

function RunButtonSection({
  transform,
  readOnly,
  onScheduled,
}: RunButtonSectionProps) {
  const [runTransform] = useRunTransformMutation();
  const [runTransformDag, { isLoading: isSubmittingDag }] =
    useRunTransformDagMutation();
  const [cancelTransform] = useCancelCurrentTransformRunMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [
    isConfirmCancellationModalOpen,
    { close: closeConfirmModal, open: openConfirmModal },
  ] = useDisclosure(false);
  const [dagDirection, setDagDirection] =
    useState<TransformDagDirection | null>(null);

  const handleRun = async () => {
    trackTransformTriggerManualRun({ transformId: transform.id });
    const { error } = await runTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
  };

  const handleRunDag = async () => {
    const direction = dagDirection;
    if (direction == null) {
      return;
    }
    trackTransformTriggerDagRun({ transformId: transform.id, direction });
    const { data, error } = await runTransformDag({
      id: transform.id,
      direction,
    });
    setDagDirection(null);
    if (error) {
      sendErrorToast(t`Failed to run transforms`);
      return;
    }
    if (data?.dag_run_id != null) {
      onScheduled(data.dag_run_id);
    } else {
      sendSuccessToast(
        t`A reprocess run for this transform is already in progress.`,
      );
    }
  };

  const handleCancel = async () => {
    const { error } = await cancelTransform(transform.id);
    if (error && !isResourceNotFoundError(error)) {
      sendErrorToast(t`Failed to cancel transform`);
    }
  };

  return (
    <>
      <RunButton
        id={transform.id}
        run={transform.last_run}
        allowCancellation
        onRun={handleRun}
        onCancel={openConfirmModal}
        isDisabled={readOnly}
        menuItems={
          readOnly ? undefined : (
            <>
              <Menu.Item onClick={() => setDagDirection("upstream")}>
                {t`Run this and all upstream transforms`}
              </Menu.Item>
              <Menu.Item onClick={() => setDagDirection("downstream")}>
                {t`Run this and all downstream transforms`}
              </Menu.Item>
            </>
          )
        }
      />
      <RunDagConfirmModal
        transformId={transform.id}
        direction={dagDirection}
        isConfirming={isSubmittingDag}
        onClose={() => setDagDirection(null)}
        onConfirm={handleRunDag}
      />
      <ConfirmModal
        title={t`Cancel this run?`}
        message={t`This requests the run to stop; it may take a moment to finish canceling.`}
        confirmButtonText={t`Cancel run`}
        closeButtonText={t`Keep running`}
        opened={isConfirmCancellationModalOpen}
        onClose={closeConfirmModal}
        onConfirm={() => {
          void handleCancel();
          closeConfirmModal();
        }}
      />
    </>
  );
}

type RunOutputSectionProps = {
  transform: Transform;
};

function RunOutputSection({ transform }: RunOutputSectionProps) {
  if (!transform?.last_run?.message) {
    return null;
  }
  const { status, message } = transform.last_run;
  if (status !== "started" && status !== "succeeded") {
    return null;
  }

  return <LogOutput content={message} />;
}

type TagSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

function TagSection({ transform, readOnly }: TagSectionProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleTagListChange = async (
    tagIds: TransformTagId[],
    undoable: boolean = false,
  ) => {
    const prevTagCount = transform.tag_ids?.length ?? 0;
    const isAdding = prevTagCount < tagIds.length;

    const { error } = await updateTransform({
      id: transform.id,
      tag_ids: tagIds,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform tags`);
    } else {
      const undo = async () => {
        const { error } = await updateTransform({
          id: transform.id,
          tag_ids: transform.tag_ids,
        });
        sendUndoToast(error);
      };

      sendSuccessToast(t`Transform tags updated`, undoable ? undo : undefined);
    }

    trackTransformRunTagsUpdated({
      added: isAdding,
      result: error ? "failure" : "success",
      transformId: transform.id,
    });
  };

  return (
    <Box flex={1}>
      <TagMultiSelect
        onChange={handleTagListChange}
        readOnly={readOnly}
        tagIds={transform.tag_ids ?? []}
      />
    </Box>
  );
}
