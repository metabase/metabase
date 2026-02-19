import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetSegmentQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { useLoadTableWithMetadata } from "../../common/hooks/use-load-table-with-metadata";
import type { SegmentTabUrls } from "../types";

type DataModelSegmentPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

export function useDataModelSegmentPage(params: DataModelSegmentPageParams) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateSegment] = useUpdateSegmentMutation();

  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);
  const segmentId = Urls.extractEntityId(params.segmentId);

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId ?? skipToken);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(segment?.table_id, {
    includeForeignTables: true,
  });

  const handleRemove = useCallback(async () => {
    if (segment == null || tableId == null || schemaName == null) {
      return;
    }

    const { error } = await updateSegment({
      id: segment.id,
      archived: true,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove segment`);
    } else {
      sendSuccessToast(t`Segment removed`);
      dispatch(
        push(
          Urls.dataStudioData({
            databaseId,
            schemaName,
            tableId,
            tab: "segments",
          }),
        ),
      );
    }
  }, [
    segment,
    tableId,
    schemaName,
    databaseId,
    updateSegment,
    dispatch,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError ?? tableError;

  const tabUrls: SegmentTabUrls | null = useMemo(() => {
    if (tableId == null || schemaName == null || segmentId == null) {
      return null;
    }
    const urlParams = { databaseId, schemaName, tableId, segmentId };
    return {
      definition: Urls.dataStudioDataModelSegment(urlParams),
      revisions: Urls.dataStudioDataModelSegmentRevisions(urlParams),
      dependencies: Urls.dataStudioDataModelSegmentDependencies(urlParams),
    };
  }, [databaseId, schemaName, tableId, segmentId]);

  return {
    isLoading,
    error,
    segment: segment ?? null,
    table: table ?? null,
    tabUrls,
    onRemove: handleRemove,
  };
}
