import { match } from "ts-pattern";

import {
  skipToken,
  useGetAdhocQueryMetadataQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getLibQuery, isMbqlQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api/table";

import { getSourceFieldOptions } from "./KeysetColumnSelect";
import { useNativeHasCheckpointFieldOptions } from "./useNativeCheckpointFieldOptions";

export const useHasCheckpointOptions = (source: TransformSource) => {
  const metadata = useSelector(getMetadata);
  const libQuery = getLibQuery(source, metadata);

  // Trigger query metadata fetch for MBQL/native query sources so metadata is populated
  // before we compute hasCheckpointOptions. Without this, getSourceFieldOptions(libQuery)
  // can return [] when the query references a card or needs schema from the API.
  useGetAdhocQueryMetadataQuery(
    source.type === "query" ? source.query : skipToken,
  );

  const isPythonTransform = source.type === "python";
  const transformType = match({
    isMbqlQuery: isMbqlQuery(source, metadata),
    isPythonTransform,
  })
    .with({ isMbqlQuery: true }, () => "mbql" as const)
    .with({ isPythonTransform: true }, () => "python" as const)
    .otherwise(() => "native" as const);

  const hasNativeCheckpointOptions =
    useNativeHasCheckpointFieldOptions(libQuery);

  const pythonTableId = isPythonTransform
    ? Object.values(source["source-tables"]).find(({ table_id }) =>
        isConcreteTableId(table_id),
      )?.table_id
    : null;
  const { data: pythonTable } = useGetTableQueryMetadataQuery(
    pythonTableId ? { id: pythonTableId } : skipToken,
  );

  const getHasCheckpointOptions = () => {
    try {
      return match(transformType)
        .with("mbql", () =>
          libQuery ? getSourceFieldOptions(libQuery).length > 0 : false,
        )
        .with("python", () => {
          if (!pythonTable?.db_id) {
            return false;
          }

          const metadataProvider = Lib.metadataProvider(
            pythonTable.db_id,
            metadata,
          );
          const tableMetadata = Lib.tableOrCardMetadata(
            metadataProvider,
            pythonTable.id,
          );
          if (!tableMetadata) {
            return false;
          }

          const tableQuery = Lib.queryFromTableOrCardMetadata(
            metadataProvider,
            tableMetadata,
          );
          return getSourceFieldOptions(tableQuery).length > 0;
        })
        .with("native", () => hasNativeCheckpointOptions)
        .exhaustive();
    } catch {
      return false;
    }
  };

  return {
    hasCheckpointOptions: getHasCheckpointOptions(),
    transformType,
  };
};
