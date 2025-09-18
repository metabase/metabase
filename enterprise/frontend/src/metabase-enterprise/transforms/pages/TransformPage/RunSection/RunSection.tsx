import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useSetting } from "metabase/common/hooks";
import { isResourceNotFoundError } from "metabase/lib/errors";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Anchor, Box, Divider, Group, Icon, Stack } from "metabase/ui";
import {
  useCancelCurrentTransformRunMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { trackTransformTriggerManualRun } from "metabase-enterprise/transforms/analytics";
import type { Transform, TransformTagId } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { RunErrorInfo } from "../../../components/RunErrorInfo";
import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";
import { getRunListUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";

type RunSectionProps = {
  transform: Transform;
};

export function RunSection({ transform }: RunSectionProps) {
  return (
    <SplitSection
      label={t`Run this transform`}
      description={t`This transform will be run whenever the jobs it belongs to are scheduled.`}
      data-testid="run-section"
    >
      <Group p="lg" justify="space-between">
        <RunStatusSection transform={transform} />
        <RunButtonSection transform={transform} />
      </Group>
      <Divider />
      <Group p="lg" gap="lg">
        <Stack gap="sm">
          <Box fw="bold">{t`Run it on a schedule with tags`}</Box>
          <Box>{t`Jobs will run all transforms with their tags.`}</Box>
        </Stack>
        <TagSection transform={transform} />
      </Group>
    </SplitSection>
  );
}

type RunStatusSectionProps = {
  transform: Transform;
};

function RunStatusSection({ transform }: RunStatusSectionProps) {
  const { id, last_run } = transform;
  const systemTimezone = useSetting("system-timezone");

  const previousStatus = usePrevious(last_run?.status);

  if (last_run == null) {
    return (
      <Group gap="sm" data-testid="run-status">
        <Icon c="text-secondary" name="calendar" />
        <Box>{t`This transform hasn’t been run before.`}</Box>
      </Group>
    );
  }

  const { status, end_time, message } = last_run;
  const endTime =
    end_time != null
      ? parseTimestampWithTimezone(end_time, systemTimezone)
      : null;
  const endTimeText = endTime != null ? endTime.fromNow() : null;

  const runsInfo = (
    <Anchor
      key="link"
      component={Link}
      to={getRunListUrl({ transformIds: [id] })}
    >
      {t`See all runs`}
    </Anchor>
  );

  const errorInfo =
    message != null ? (
      <RunErrorInfo
        message={message}
        endTime={endTime ? endTime.toDate() : null}
      />
    ) : null;

  switch (status) {
    case "started":
      return (
        <Group gap="sm" data-testid="run-status">
          <Icon c="text-primary" name="sync" />
          <Box>{t`Run in progress…`}</Box>
        </Group>
      );
    case "succeeded":
      return (
        <Stack gap={0}>
          <Group gap="sm" data-testid="run-status">
            <Icon c="success" name="check_filled" />
            <Box>
              {endTimeText
                ? t`Last ran ${endTimeText} successfully.`
                : t`Last ran successfully.`}
            </Box>
            {runsInfo}
          </Group>
          {previousStatus === "canceling" && (
            <Box
              c="text-light"
              ml="lg"
            >{t`This run succeeded before it had a chance to cancel.`}</Box>
          )}
        </Stack>
      );
    case "failed":
      return (
        <Group gap={0} data-testid="run-status">
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run failed ${endTimeText}.`
              : t`Last run failed.`}
          </Box>
          {errorInfo ?? runsInfo}
        </Group>
      );
    case "timeout":
      return (
        <Group gap={0} data-testid="run-status">
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run timed out ${endTimeText}.`
              : t`Last run timed out.`}
          </Box>
          {errorInfo ?? runsInfo}
        </Group>
      );
    case "canceling":
      return (
        <Group gap="sm" data-testid="run-status">
          <Icon c="text-secondary" name="close" />
          <Box>{t`Canceling…`}</Box>
        </Group>
      );
    case "canceled":
      return (
        <Group gap="sm" data-testid="run-status">
          <Icon c="text-secondary" name="close" />
          <Box>
            {endTimeText
              ? t`Last run was canceled ${endTimeText}.`
              : t`Last run was canceled.`}
          </Box>
          {runsInfo}
        </Group>
      );
    default:
      return null;
  }
}

type RunButtonSectionProps = {
  transform: Transform;
};

function RunButtonSection({ transform }: RunButtonSectionProps) {
  const [runTransform] = useRunTransformMutation();
  const [cancelTransform] = useCancelCurrentTransformRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [
    isConfirmCancellationModalOpen,
    { close: closeConfirmModal, open: openConfirmModal },
  ] = useDisclosure(false);

  const handleRun = async () => {
    trackTransformTriggerManualRun({
      transformId: transform.id,
      triggeredFrom: "transform-page",
    });
    const { error } = await runTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
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
        allowCancellation
        run={transform.last_run}
        onRun={handleRun}
        onCancel={openConfirmModal}
      />
      <ConfirmModal
        title={t`Cancel this run?`}
        opened={isConfirmCancellationModalOpen}
        onClose={closeConfirmModal}
        onConfirm={() => {
          void handleCancel();
          closeConfirmModal();
        }}
        closeButtonText={t`No`}
      />
    </>
  );
}

type TagSectionProps = {
  transform: Transform;
};

function TagSection({ transform }: TagSectionProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleTagListChange = async (
    tagIds: TransformTagId[],
    undoable: boolean = false,
  ) => {
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
  };

  return (
    <Box flex={1}>
      <TagMultiSelect
        tagIds={transform.tag_ids ?? []}
        onChange={handleTagListChange}
      />
    </Box>
  );
}
