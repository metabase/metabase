import dayjs from "dayjs";
import { Link } from "react-router";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Anchor, Box, Divider, Group, Icon, Stack } from "metabase/ui";
import {
  useExecuteTransformMutation,
  useLazyGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform, TransformTagId } from "metabase-types/api";

import { RunButton } from "../../../components/RunButton";
import { RunErrorInfo } from "../../../components/RunErrorInfo";
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
  const { id, last_execution } = transform;

  if (last_execution == null) {
    return (
      <Group gap="sm">
        <Icon c="text-secondary" name="calendar" />
        <Box>{t`This transform hasn’t been run before.`}</Box>
      </Group>
    );
  }

  const { status, end_time, message } = last_execution;
  const endTimeText =
    end_time != null ? dayjs(end_time).local().fromNow() : null;

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
      <RunErrorInfo title={t`Transform run error`} error={message} />
    ) : null;

  switch (status) {
    case "started":
      return (
        <Group gap="sm">
          <Icon c="text-primary" name="sync" />
          <Box>{t`Run in progress…`}</Box>
        </Group>
      );
    case "succeeded":
      return (
        <Group gap="sm">
          <Icon c="success" name="check_filled" />
          <Box>
            {endTimeText
              ? t`Last ran ${endTimeText} successfully.`
              : t`Last ran successfully.`}
          </Box>
          {runsInfo}
        </Group>
      );
    case "failed":
      return (
        <Group gap={0}>
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
        <Group gap={0}>
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run timed out ${endTimeText}.`
              : t`Last run timed out.`}
          </Box>
          {errorInfo ?? runsInfo}
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
  const [fetchTransform, { isFetching }] = useLazyGetTransformQuery();
  const [executeTransform, { isLoading: isExecuting }] =
    useExecuteTransformMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleRun = async () => {
    const { error } = await executeTransform(transform.id);
    if (error) {
      sendErrorToast(t`Failed to run transform`);
    } else {
      fetchTransform(transform.id);
    }
    return { error };
  };

  return (
    <RunButton
      execution={transform.last_execution}
      isLoading={isFetching || isExecuting}
      onRun={handleRun}
    />
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
