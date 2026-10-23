import { useMemo } from "react";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import type { UseHasDataResult } from "../../metabot-analytics/hooks/useHasData";
import { useHasData } from "../../metabot-analytics/hooks/useHasData";
import type { McpFilters } from "../query-utils";
import { buildTotalCountQuery } from "../query-utils";

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

export function useMcpHasData({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  errorsOnly = false,
}: DataSources & McpFilters & { errorsOnly?: boolean }): UseHasDataResult {
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
