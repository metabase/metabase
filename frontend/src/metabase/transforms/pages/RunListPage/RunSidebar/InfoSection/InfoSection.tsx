import { type ReactNode, useId } from "react";
import { t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, Card, Stack } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import { CheckpointValue } from "../../../../components/CheckpointValue";
import {
  formatRunMethod,
  formatStatus,
  isErrorStatus,
} from "../../../../utils";

import S from "./InfoSection.module.css";

type InfoSectionProps = {
  run: TransformRun;
};

export function InfoSection({ run }: InfoSectionProps) {
  const { data: checkpointField } = useGetFieldQuery(
    run.checkpoint_filter_field_id
      ? { id: run.checkpoint_filter_field_id }
      : skipToken,
  );

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Started at`}>
        <DateTime value={run.start_time} unit="minute" />
      </InfoSectionItem>
      {run.end_time != null && (
        <InfoSectionItem label={t`Ended at`}>
          <DateTime value={run.end_time} unit="minute" />
        </InfoSectionItem>
      )}
      <InfoSectionItem label={t`Status`}>
        <Box c={isErrorStatus(run.status) ? "error" : undefined}>
          {formatStatus(run.status)}
        </Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Trigger`}>
        {formatRunMethod(run.run_method)}
      </InfoSectionItem>
      {formatSchemaTable(run.target_schema, run.target_table) != null && (
        <InfoSectionItem label={t`Target`}>
          {formatSchemaTable(run.target_schema, run.target_table)}
        </InfoSectionItem>
      )}
      {formatSchemaTable(run.workspace_schema, run.workspace_table) != null && (
        <InfoSectionItem label={t`Workspace`}>
          {formatSchemaTable(run.workspace_schema, run.workspace_table)}
        </InfoSectionItem>
      )}
      {checkpointField != null && (
        <InfoSectionItem label={t`Checkpoint field`}>
          {checkpointField.display_name}
        </InfoSectionItem>
      )}
      {run.checkpoint_lo_value != null && (
        <InfoSectionItem label={t`Checkpoint from`}>
          <CheckpointValue
            value={run.checkpoint_lo_value}
            checkpointField={checkpointField}
          />
        </InfoSectionItem>
      )}
      {run.checkpoint_hi_value != null && (
        <InfoSectionItem label={t`Checkpoint to`}>
          <CheckpointValue
            value={run.checkpoint_hi_value}
            checkpointField={checkpointField}
          />
        </InfoSectionItem>
      )}
    </Card>
  );
}

function formatSchemaTable(
  schema: string | null | undefined,
  table: string | null | undefined,
): string | null {
  if (table == null) {
    return null;
  }
  return schema ? `${schema}.${table}` : table;
}

type InfoSectionItemProps = {
  label: string;
  children?: ReactNode;
};

function InfoSectionItem({ label, children }: InfoSectionItemProps) {
  const labelId = useId();

  return (
    <Stack
      className={S.section}
      p="md"
      gap="xs"
      role="group"
      aria-labelledby={labelId}
    >
      <Box
        id={labelId}
        className={CS.textWrap}
        c="text-secondary"
        fz="sm"
        lh="h5"
      >
        {label}
      </Box>
      <Box lh="h4">{children}</Box>
    </Stack>
  );
}
