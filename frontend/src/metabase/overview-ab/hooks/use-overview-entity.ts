import { useMemo } from "react";

import {
  type OverviewEntityType,
  skipToken,
  useGetCardQuery,
  useGetTableQueryMetadataQuery,
  useListTransformsQuery,
} from "metabase/api";
import { getMetadata } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card, DatasetQuery, TableId } from "metabase-types/api";

type OverviewEntity = {
  name: string | undefined;
  /** A card whose query yields the entity's rows, for the data strip. */
  rowsCard: Card | undefined;
};

function tableRowsQuery(
  metadata: Metadata,
  tableId: TableId,
): DatasetQuery | undefined {
  const table = metadata.table(tableId);
  if (!table) {
    return undefined;
  }
  const provider = Lib.metadataProvider(table.db_id, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(provider, tableId);
  return tableMetadata
    ? Lib.toLegacyQuery(
        Lib.queryFromTableOrCardMetadata(provider, tableMetadata),
      )
    : undefined;
}

/** Name and row-level query for the entity under review. */
export function useOverviewEntity(
  entityType: OverviewEntityType | undefined,
  entityId: number | undefined,
): OverviewEntity {
  const metadata = useSelector(getMetadata);

  const { data: table } = useGetTableQueryMetadataQuery(
    entityType === "table" && entityId != null ? { id: entityId } : skipToken,
  );
  const { data: metricCard } = useGetCardQuery(
    entityType === "metric" && entityId != null ? { id: entityId } : skipToken,
  );
  const { data: transforms } = useListTransformsQuery(
    entityType === "transform" ? {} : skipToken,
  );

  return useMemo(() => {
    switch (entityType) {
      case "table": {
        const datasetQuery =
          table != null ? tableRowsQuery(metadata, table.id) : undefined;
        return {
          name: table?.display_name ?? table?.name,
          rowsCard: datasetQuery
            ? Question.create({
                metadata,
                dataset_query: datasetQuery,
                display: "table",
              }).card()
            : undefined,
        };
      }
      case "metric":
        return {
          name: metricCard?.name,
          rowsCard: metricCard
            ? { ...metricCard, display: "table" }
            : undefined,
        };
      case "transform":
        return {
          name: transforms?.find((transform) => transform.id === entityId)
            ?.name,
          rowsCard: undefined,
        };
      default:
        return { name: undefined, rowsCard: undefined };
    }
  }, [entityType, entityId, table, metricCard, transforms, metadata]);
}
