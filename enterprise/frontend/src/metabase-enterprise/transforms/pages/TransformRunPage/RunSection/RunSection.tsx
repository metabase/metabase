import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { isResourceNotFoundError } from "metabase/lib/errors";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Anchor,
  Box,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  useCancelCurrentTransformRunMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { trackTransformTriggerManualRun } from "metabase-enterprise/transforms/analytics";
import { LogOutput } from "metabase-enterprise/transforms/components/LogOutput";
import type { Transform, TransformTagId } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { RunStatus } from "../../../components/RunStatus";
import { TagMultiSelect } from "../../../components/TagMultiSelect";
import { getRunListUrl } from "../../../urls";

type RunSectionProps = {
  transform: Transform;
};

export function RunSection({ transform }: RunSectionProps) {
  return (
    <Stack gap="xl">
      <Stack flex={1} gap="sm">
        <Title order={4}>{t`Run this transform`}</Title>
        <Text c="text-secondary">{t`This transform will be run whenever the jobs it belongs are scheduled`}</Text>
      </Stack>
      <Card p={0} shadow="none" withBorder>
        <Stack>
          <Group p="lg" justify="space-between">
            <RunStatusSection transform={transform} />
            <RunButtonSection transform={transform} />
          </Group>
          <RunOutputSection transform={transform} />
        </Stack>
        <Divider />
        <Group p="lg" gap="lg">
          <Stack gap="sm">
            <Box fw="bold">{t`Run it on a schedule with tags`}</Box>
            <Box>{t`Jobs will run all transforms with their tags.`}</Box>
          </Stack>
          <TagSection transform={transform} />
        </Group>
      </Card>
    </Stack>
  );
}

type RunStatusSectionProps = {
  transform: Transform;
};

function RunStatusSection({ transform }: RunStatusSectionProps) {
  const { id, last_run } = transform;

  const status = last_run?.status;
  const previousStatus = usePrevious(status);

  const runExtra = status === "succeeded" && previousStatus === "canceling" && (
    <Box
      c="text-light"
      ml="lg"
    >{t`This run succeeded before it had a chance to cancel.`}</Box>
  );

  return (
    <Stack gap={0}>
      <RunStatus
        run={last_run ?? null}
        neverRunMessage={t`This transform hasn’t been run before.`}
        runInfo={
          <Anchor
            key="link"
            component={Link}
            to={getRunListUrl({ transformIds: [id] })}
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
