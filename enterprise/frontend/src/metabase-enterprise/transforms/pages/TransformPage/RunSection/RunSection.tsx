import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Divider, Group, Icon, Stack, Text } from "metabase/ui";
import {
  useExecuteTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform, TransformTagId } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";

import { getRunStatusInfo } from "./utils";

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
  const { message, icon, color } = getRunStatusInfo(transform);

  return (
    <Group gap="sm">
      <Icon name={icon} c={color} />
      <Text>{message}</Text>
    </Group>
  );
}

type RunButtonSectionProps = {
  transform: Transform;
};

function RunButtonSection({ transform }: RunButtonSectionProps) {
  const [executeTransform] = useExecuteTransformMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
    return { error };
  };

  return <RunButton execution={transform.last_execution} onRun={handleRun} />;
}

type TagSectionProps = {
  transform: Transform;
};

function TagSection({ transform }: TagSectionProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleTagListChange = async (tagIds: TransformTagId[]) => {
    const { error } = await updateTransform({
      id: transform.id,
      tag_ids: tagIds,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform tags`);
    } else {
      sendSuccessToast(t`Transform tags updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          tag_ids: transform.tag_ids,
        });
        sendUndoToast(error);
      });
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
