import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  useCancelCurrentTransformRunMutation,
  useRunTransformMutation,
  useUpdateTransformMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { isResourceNotFoundError } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { Anchor, Box, Card, Divider, Group, Stack } from "metabase/ui";
import type { Transform, TransformTagId } from "metabase-types/api";

import {
  trackTransformRunTagsUpdated,
  trackTransformTriggerManualRun,
} from "../../../analytics";
import { RunButton } from "../../../components/RunButton";
import { RunStatus } from "../../../components/RunStatus";
import { TagMultiSelect } from "../../../components/TagMultiSelect";
import { TitleSection } from "../../../components/TitleSection";

import { LogOutput } from "./LogOutput";

type RunSectionProps = {
  transform: Transform;
  readOnly?: boolean;
  noTitle?: boolean;
};

export function RunSection({ transform, readOnly, noTitle }: RunSectionProps) {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const content = (
    <>
      <Stack>
        <Group p="lg" justify="space-between">
          <RunStatusSection transform={transform} />
          <RunButtonSection transform={transform} readOnly={readOnly} />
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
      description={t`This transform will be run whenever the jobs it belongs are scheduled.`}
    >
      {content}
    </TitleSection>
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
      c="text-tertiary"
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
            to={Urls.transformRunList({ transformIds: [id] })}
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
};

function RunButtonSection({ transform, readOnly }: RunButtonSectionProps) {
  const [runTransform] = useRunTransformMutation();
  const [cancelTransform] = useCancelCurrentTransformRunMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [
    isConfirmCancellationModalOpen,
    { close: closeConfirmModal, open: openConfirmModal },
  ] = useDisclosure(false);

  const handleRun = async () => {
    trackTransformTriggerManualRun({ transformId: transform.id });
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
        id={transform.id}
        run={transform.last_run}
        allowCancellation
        onRun={handleRun}
        onCancel={openConfirmModal}
        isDisabled={readOnly}
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
