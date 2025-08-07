import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import {
  useExecuteTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform, TransformTagId } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";

import { getStatusInfo } from "./utils";

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
        <RunStatus transform={transform} />
        <RunButton transform={transform} />
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

type RunStatusProps = {
  transform: Transform;
};

function RunStatus({ transform }: RunStatusProps) {
  const { message, icon, color } = getStatusInfo(transform);

  return (
    <Group gap="sm">
      <Icon name={icon} c={color} />
      <Text>{message}</Text>
    </Group>
  );
}

type RunButtonProps = {
  transform: Transform;
};

function RunButton({ transform }: RunButtonProps) {
  const [executeTransform] = useExecuteTransformMutation();
  const isRunning = transform.last_execution?.status === "started";
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    }
  };

  return (
    <Button
      variant="filled"
      leftSection={
        isRunning ? <Loader size="sm" /> : <Icon name="play_outlined" />
      }
      disabled={isRunning}
      onClick={handleRun}
    >
      {isRunning ? t`Running now…` : t`Run now`}
    </Button>
  );
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
