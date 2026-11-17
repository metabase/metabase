import { useMemo } from "react";

import type { CliFilters } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import { buildTotalCountQuery } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import type { UseHasDataResult } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useHasData";
import { useHasData } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useHasData";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

export function useCliHasData({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  errorsOnly = false,
}: DataSources & CliFilters & { errorsOnly?: boolean }): UseHasDataResult {
  const query = useMemo(
    () =>
      provider && table && groupMembersTable
        ? buildTotalCountQuery({
            provider,
            table,
            groupMembersTable,
            dateFilter,
            userId,
            groupId,
            tenantId,
            errorsOnly,
          })
        : null,
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      errorsOnly,
    ],
  );

  return useHasData(query);
}
