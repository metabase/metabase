import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetMeasureQuery,
  useUpdateMeasureMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { useLoadTableWithMetadata } from "../../common/hooks/use-load-table-with-metadata";
import type { MeasureTabUrls } from "../types";

type DataModelMeasurePageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId: string;
};

export function useDataModelMeasurePage(params: DataModelMeasurePageParams) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateMeasure] = useUpdateMeasureMutation();

  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);
  const measureId = Urls.extractEntityId(params.measureId);

  const {
    data: measure,
    isLoading: isLoadingMeasure,
    error: measureError,
  } = useGetMeasureQuery(measureId ?? skipToken);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(measure?.table_id, {
    includeForeignTables: true,
  });

  const handleRemove = useCallback(async () => {
    if (measure == null || tableId == null || schemaName == null) {
      return;
    }

    const { error } = await updateMeasure({
      id: measure.id,
      archived: true,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove measure`);
    } else {
      sendSuccessToast(t`Measure removed`);
      dispatch(
        push(
          Urls.dataStudioData({
            databaseId,
            schemaName,
            tableId,
            tab: "measures",
          }),
        ),
      );
    }
  }, [
    measure,
    tableId,
    schemaName,
    databaseId,
    updateMeasure,
    dispatch,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const isLoading = isLoadingMeasure || isLoadingTable;
  const error = measureError ?? tableError;

  const tabUrls: MeasureTabUrls | null = useMemo(() => {
    if (tableId == null || schemaName == null || measureId == null) {
      return null;
    }
    const urlParams = { databaseId, schemaName, tableId, measureId };
    return {
      definition: Urls.dataStudioDataModelMeasure(urlParams),
      revisions: Urls.dataStudioDataModelMeasureRevisions(urlParams),
      dependencies: Urls.dataStudioDataModelMeasureDependencies(urlParams),
    };
  }, [databaseId, schemaName, tableId, measureId]);

  return {
    isLoading,
    error,
    measure: measure ?? null,
    table: table ?? null,
    tabUrls,
    onRemove: handleRemove,
  };
}
