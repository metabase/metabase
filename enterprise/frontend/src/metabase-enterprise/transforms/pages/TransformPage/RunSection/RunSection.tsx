import { Link } from "react-router";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Anchor, Box, Divider, Group, Stack } from "metabase/ui";
import {
  useRunTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { trackTranformTriggerManualRun } from "metabase-enterprise/transforms/analytics";
import type { Transform, TransformTagId } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { RunStatus } from "../../../components/RunStatus";
import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";
import { getRunListUrl } from "../../../urls";

type RunSectionProps = {
  transform: Transform;
};

export function RunSection({ transform }: RunSectionProps) {
  return (
    <SplitSection
      label={t`Run this transform`}
      description={t`This transform will be run whenever the jobs it belongs to are scheduled.`}
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

  return (
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
  );
}

type RunButtonSectionProps = {
  transform: Transform;
};

function RunButtonSection({ transform }: RunButtonSectionProps) {
  const [runTransform] = useRunTransformMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    trackTranformTriggerManualRun({
      transformId: transform.id,
      triggeredFrom: "transform-page",
    });

    const { error } = await runTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
    return { error };
  };

  return <RunButton run={transform.last_run} onRun={handleRun} />;
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
