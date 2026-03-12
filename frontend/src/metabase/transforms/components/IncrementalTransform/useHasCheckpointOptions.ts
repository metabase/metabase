import { match } from "ts-pattern";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
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

  const isPythonTransform = source.type === "python";
  const transformType = match({
    isMbqlQuery: isMbqlQuery(source, metadata),
    isPythonTransform,
  })
    .with({ isMbqlQuery: true }, () => "query" as const)
    .with({ isPythonTransform: true }, () => "python" as const)
    .otherwise(() => "native" as const);

  const hasNativeCheckpointOptions =
    useNativeHasCheckpointFieldOptions(libQuery);

  const pythonTableId = isPythonTransform
    ? Object.values(source["source-tables"]).find(isConcreteTableId)
    : null;
  const { data: pythonTable } = useGetTableQueryMetadataQuery(
    pythonTableId ? { id: pythonTableId } : skipToken,
  );

  const getHasCheckpointOptions = () => {
    try {
      return match(transformType)
        .with("query", () =>
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
    hasNativeCheckpointOptions,
    transformType,
  };
};
