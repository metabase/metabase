import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, Card, FixedSizeIcon, Group, Stack } from "metabase/ui";
import type { Database, QueryExecution } from "metabase-types/api";

import { formatResultRows, formatRunningTime } from "../../utils";

import S from "./InfoSection.module.css";

type InfoSectionProps = {
  item: QueryExecution;
  database: Database | undefined;
};

export function InfoSection({ item, database }: InfoSectionProps) {
  const databaseName = database?.name ?? t`Database ${item.database_id}`;

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Database`}>
        <Group align="center" gap="sm" wrap="nowrap">
          <FixedSizeIcon name="database" />
          <Box className={CS.textWrap}>{databaseName}</Box>
        </Group>
      </InfoSectionItem>
      <InfoSectionItem label={t`Start time`}>
        <Box className={CS.textWrap}>
          <DateTime value={item.started_at} />
        </Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Running time`}>
        <Box className={CS.textWrap}>
          {formatRunningTime(item.running_time)}
        </Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Result rows`}>
        <Box className={CS.textWrap}>{formatResultRows(item.result_rows)}</Box>
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
      <Group lh="h4" justify="space-between" wrap="nowrap">
        {children}
      </Group>
    </Stack>
  );
}
