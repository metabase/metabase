import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, FixedSizeIcon, Group } from "metabase/ui";
import type { Database, QueryExecution } from "metabase-types/api";

import { formatResultRows, formatRunningTime } from "../../utils";
import { InfoList, InfoListItem } from "../InfoList";

type InfoSectionProps = {
  execution: QueryExecution;
  database: Database | undefined;
};

export function InfoSection({ execution, database }: InfoSectionProps) {
  const databaseName = database?.name ?? t`Database ${execution.database_id}`;

  return (
    <InfoList aria-label={t`Info`}>
      <InfoListItem label={t`Database`}>
        <Group align="center" gap="sm" wrap="nowrap">
          <FixedSizeIcon name="database" />
          <Box className={CS.textWrap}>{databaseName}</Box>
        </Group>
      </InfoListItem>
      <InfoListItem label={t`Start time`}>
        <Box className={CS.textWrap}>
          <DateTime value={execution.started_at} />
        </Box>
      </InfoListItem>
      <InfoListItem label={t`Running time`}>
        <Box className={CS.textWrap}>
          {formatRunningTime(execution.running_time)}
        </Box>
      </InfoListItem>
      <InfoListItem label={t`Result rows`}>
        <Box className={CS.textWrap}>
          {formatResultRows(execution.result_rows)}
        </Box>
      </InfoListItem>
    </InfoList>
  );
}
