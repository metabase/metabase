import { useMemo } from "react";
import { match } from "ts-pattern";

import {
  skipToken,
  useGetTableQueryMetadataQuery,
  useUpdateTransformMutation,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getLibQuery, isMbqlQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type { Transform, TransformSource } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api/table";

import { getSourceFieldOptions } from "./KeysetColumnSelect";
import {
  type IncrementalSettingsFormValues,
  VALIDATION_SCHEMA,
  convertTransformFormToUpdateRequest,
  getIncrementalSettingsFromTransform,
} from "./form";
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

  const hasCheckpointOptions = (() => {
    try {
      if (transformType === "query") {
        return libQuery ? getSourceFieldOptions(libQuery).length > 0 : false;
      }

      if (transformType === "python") {
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
      }

      if (transformType === "native") {
        return hasNativeCheckpointOptions;
      }
    } catch {
      return false;
    }

    return true;
  })();

  return {
    hasCheckpointOptions,
    hasNativeCheckpointOptions,
    transformType,
  };
};

export const useUpdateIncrementalSettings = (transform: Transform) => {
  const [updateTransform] = useUpdateTransformMutation();
  const initialValues = useMemo(
    () => getIncrementalSettingsFromTransform(transform),
    [transform],
  );

  const updateIncrementalSettings = async (
    values: IncrementalSettingsFormValues,
  ) => {
    const requestData = convertTransformFormToUpdateRequest(transform, values);
    return await updateTransform(requestData).unwrap();
  };

  return {
    initialValues,
    validationSchema: VALIDATION_SCHEMA,
    updateIncrementalSettings,
  };
};
