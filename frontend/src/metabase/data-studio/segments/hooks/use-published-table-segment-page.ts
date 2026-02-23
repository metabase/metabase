import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetSegmentQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { useLoadTableWithMetadata } from "../../common/hooks/use-load-table-with-metadata";
import type { SegmentTabUrls } from "../types";

type PublishedTableSegmentPageParams = {
  tableId: string;
  segmentId: string;
};

export function usePublishedTableSegmentPage(
  params: PublishedTableSegmentPageParams,
) {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [updateSegment] = useUpdateSegmentMutation();

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
    if (segment == null || tableId == null) {
      return;
    }

    const { error } = await updateSegment({
      id: segment.id,
      archived: true,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendToast({ icon: "warning", message: t`Failed to remove segment` });
    } else {
      sendToast({ icon: "check", message: t`Segment removed` });
      dispatch(push(Urls.dataStudioTableSegments(tableId)));
    }
  }, [segment, tableId, updateSegment, dispatch, sendToast]);

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError ?? tableError;

  const tabUrls: SegmentTabUrls | null = useMemo(() => {
    if (tableId == null || segmentId == null) {
      return null;
    }
    return {
      definition: Urls.dataStudioPublishedTableSegment(tableId, segmentId),
      revisions: Urls.dataStudioPublishedTableSegmentRevisions(
        tableId,
        segmentId,
      ),
      dependencies: Urls.dataStudioPublishedTableSegmentDependencies(
        tableId,
        segmentId,
      ),
    };
  }, [tableId, segmentId]);

  return {
    isLoading,
    error,
    segment: segment ?? null,
    table: table ?? null,
    tabUrls,
    onRemove: handleRemove,
  };
}
