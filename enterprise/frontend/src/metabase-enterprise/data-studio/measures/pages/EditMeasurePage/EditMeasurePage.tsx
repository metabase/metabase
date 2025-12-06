import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useDeleteMeasureMutation,
  useGetMeasureQuery,
  useUpdateMeasureMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { DatasetQuery } from "metabase-types/api";

import { MeasureEditorPage } from "../../components/MeasureEditorPage";

type EditMeasurePageProps = {
  params: { measureId: string };
  route: Route;
};

export function EditMeasurePage({ params, route }: EditMeasurePageProps) {
  const dispatch = useDispatch();
  const measureId = Urls.extractEntityId(params.measureId);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const {
    data: measure,
    isLoading: isLoadingMeasure,
    error: measureError,
  } = useGetMeasureQuery(measureId ?? skipToken);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(measure?.table_id);

  const [updateMeasure, { isLoading: isSaving }] = useUpdateMeasureMutation();
  const [deleteMeasure, { isLoading: isRemoving }] = useDeleteMeasureMutation();

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      definition: DatasetQuery;
    }) => {
      if (!measure) {
        return;
      }
      const { error } = await updateMeasure({
        id: measure.id,
        name: data.name,
        description: data.description || undefined,
        definition: data.definition,
        revision_message: t`Updated from Data Studio`,
      });

      if (error) {
        sendErrorToast(t`Failed to update measure`);
      } else {
        sendSuccessToast(t`Measure updated`);
      }
    },
    [measure, updateMeasure, sendSuccessToast, sendErrorToast],
  );

  const handleRemove = useCallback(async () => {
    if (!measure || !table) {
      return;
    }
    const { error } = await deleteMeasure({
      id: measure.id,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove measure`);
    } else {
      sendSuccessToast(t`Measure removed`);
      dispatch(
        push(
          Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            tab: "measures",
          }),
        ),
      );
    }
  }, [
    measure,
    table,
    deleteMeasure,
    dispatch,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const isLoading = isLoadingMeasure || isLoadingTable;
  const error = measureError || tableError;

  if (isLoading || error || !measure || !table) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <MeasureEditorPage
      measure={measure}
      table={table}
      route={route}
      isSaving={isSaving}
      isRemoving={isRemoving}
      onSave={handleSave}
      onRemove={handleRemove}
      testId="edit-measure-page"
    />
  );
}
