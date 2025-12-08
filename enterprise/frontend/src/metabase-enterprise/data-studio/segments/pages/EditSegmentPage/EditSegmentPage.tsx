import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useDeleteSegmentMutation,
  useGetSegmentQuery,
  useUpdateSegmentMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { DatasetQuery } from "metabase-types/api";

import { SegmentEditorPage } from "../../components/SegmentEditorPage";

type EditSegmentPageProps = {
  params: { segmentId: string };
  route: Route;
};

export function EditSegmentPage({ params, route }: EditSegmentPageProps) {
  const dispatch = useDispatch();
  const segmentId = Urls.extractEntityId(params.segmentId);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId ?? skipToken);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(segment?.table_id);

  const [updateSegment, { isLoading: isSaving }] = useUpdateSegmentMutation();
  const [deleteSegment, { isLoading: isRemoving }] = useDeleteSegmentMutation();

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      definition: DatasetQuery;
    }) => {
      if (!segment) {
        return;
      }
      const { error } = await updateSegment({
        id: segment.id,
        name: data.name,
        description: data.description || undefined,
        definition: data.definition,
        revision_message: t`Updated from Data Studio`,
      });

      if (error) {
        sendErrorToast(t`Failed to update segment`);
      } else {
        sendSuccessToast(t`Segment updated`);
      }
    },
    [segment, updateSegment, sendSuccessToast, sendErrorToast],
  );

  const handleRemove = useCallback(async () => {
    if (!segment || !table) {
      return;
    }
    const { error } = await deleteSegment({
      id: segment.id,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove segment`);
    } else {
      sendSuccessToast(t`Segment removed`);
      dispatch(
        push(
          Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            tab: "segments",
          }),
        ),
      );
    }
  }, [
    segment,
    table,
    deleteSegment,
    dispatch,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError || tableError;

  if (isLoading || error || !segment || !table) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentEditorPage
      segment={segment}
      table={table}
      route={route}
      isSaving={isSaving}
      isRemoving={isRemoving}
      onSave={handleSave}
      onRemove={handleRemove}
      testId="edit-segment-page"
    />
  );
}
