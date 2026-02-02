import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, Card, Stack } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";

import {
  formatRunMethod,
  formatStatus,
  isErrorStatus,
} from "../../../../utils";
import S from "../RunSidebar.module.css";

type InfoSectionProps = {
  run: TransformRun;
};

export function InfoSection({ run }: InfoSectionProps) {
  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Started at`}>
        <DateTime value={run.start_time} unit="second" />
      </InfoSectionItem>
      {run.end_time != null && (
        <InfoSectionItem label={t`Ended at`}>
          <DateTime value={run.end_time} unit="second" />
        </InfoSectionItem>
      )}
      <InfoSectionItem label={t`Status`}>
        <Box c={isErrorStatus(run.status) ? "error" : undefined}>
          {formatStatus(run.status)}
        </Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Run method`}>
        {formatRunMethod(run.run_method)}
      </InfoSectionItem>
    </Card>
  );
}

type InfoSectionItemProps = {
  label: string;
  children?: ReactNode;
};

function InfoSectionItem({ label, children }: InfoSectionItemProps) {
  return (
    <Stack className={S.section} p="md" gap="xs">
      <Box className={CS.textWrap} c="text-secondary" fz="sm" lh="h5">
        {label}
      </Box>
      <Box lh="h4">{children}</Box>
    </Stack>
  );
}
