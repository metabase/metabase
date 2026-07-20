import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { ErrorSection } from "metabase/transforms/components/ErrorSection";
import {
  formatStatus,
  getRunDurationMs,
  getTransformRunName,
  isErrorStatus,
} from "metabase/transforms/utils";
import { Anchor, Box, FixedSizeIcon, Group, Stack, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatDurationLong } from "metabase/utils/formatting/time";
import type { TransformRunForJobRun } from "metabase-types/api";

import S from "./TransformRunItem.module.css";

type TransformRunItemProps = {
  transformRun: TransformRunForJobRun;
};

export function TransformRunItem({ transformRun }: TransformRunItemProps) {
  const name = transformRun.transform_name ?? getTransformRunName(transformRun);
  const transformId = transformRun.transform_id;
  const durationMs = getRunDurationMs(transformRun);

  return (
    <Group
      className={S.transformItem}
      p="md"
      gap="sm"
      wrap="nowrap"
      align="start"
      aria-label={name}
      data-testid="transform-run-item"
    >
      <FixedSizeIcon name="transform" />
      <Stack gap="sm" flex={1} miw={0}>
        <Box className={CS.textWrap} lh="1rem">
          {name}
        </Box>
        <Group gap="sm" wrap="nowrap" fz="sm" lh="1rem">
          <Box
            c={
              isErrorStatus(transformRun.status)
                ? "feedback-negative"
                : undefined
            }
          >
            {formatStatus(transformRun.status)}
          </Box>
          <Box c="text-secondary">•</Box>
          <Tooltip label={<TransformRunTimes run={transformRun} />}>
            <Box>
              {durationMs != null
                ? formatDurationLong(durationMs)
                : EMPTY_CELL_PLACEHOLDER}
            </Box>
          </Tooltip>
          {transformId != null && (
            <>
              <Box c="text-secondary">•</Box>
              <Anchor
                component={ForwardRefLink}
                to={Urls.transform(transformId)}
                target="_blank"
                lh="inherit"
                fz="inherit"
              >
                {t`View transform`}
              </Anchor>
            </>
          )}
        </Group>
        {transformRun.message != null && (
          <ErrorSection run={transformRun} showTitle={false} />
        )}
      </Stack>
    </Group>
  );
}

type TransformRunTimesProps = {
  run: TransformRunForJobRun;
};

function TransformRunTimes({ run }: TransformRunTimesProps) {
  return (
    <Group gap="xs" wrap="nowrap">
      <DateTime value={run.start_time} unit="minute" />
      {run.end_time != null && (
        <>
          {"–"}
          <DateTime value={run.end_time} unit="minute" />
        </>
      )}
    </Group>
  );
}
