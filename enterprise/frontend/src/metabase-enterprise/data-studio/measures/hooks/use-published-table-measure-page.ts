import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetMeasureQuery,
  useUpdateMeasureMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { useLoadTableWithMetadata } from "../../common/hooks/use-load-table-with-metadata";
import type { MeasureTabUrls } from "../types";

type PublishedTableMeasurePageParams = {
  tableId: string;
  measureId: string;
};

export function usePublishedTableMeasurePage(
  params: PublishedTableMeasurePageParams,
) {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateMeasure] = useUpdateMeasureMutation();

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
    if (measure == null || tableId == null) {
      return;
    }

    const { error } = await updateMeasure({
      id: measure.id,
      archived: true,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendToast({ icon: "warning", message: t`Failed to remove measure` });
    } else {
      sendToast({ icon: "check", message: t`Measure removed` });
      dispatch(push(Urls.dataStudioTableMeasures(tableId)));
    }
  }, [measure, tableId, updateMeasure, dispatch, sendToast]);

  const isLoading = isLoadingMeasure || isLoadingTable;
  const error = measureError ?? tableError;

  const tabUrls: MeasureTabUrls | null = useMemo(() => {
    if (tableId == null || measureId == null) {
      return null;
    }
    return {
      definition: Urls.dataStudioPublishedTableMeasure(tableId, measureId),
      revisions: Urls.dataStudioPublishedTableMeasureRevisions(
        tableId,
        measureId,
      ),
      dependencies: Urls.dataStudioPublishedTableMeasureDependencies(
        tableId,
        measureId,
      ),
    };
  }, [tableId, measureId]);

  return {
    isLoading,
    error,
    measure: measure ?? null,
    table: table ?? null,
    tabUrls,
    onRemove: handleRemove,
  };
}
