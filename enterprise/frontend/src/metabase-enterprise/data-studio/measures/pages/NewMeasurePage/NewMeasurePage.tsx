import type { Location } from "history";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateMeasureMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { DatasetQuery } from "metabase-types/api";

import { MeasureEditorPage } from "../../components/MeasureEditorPage";

type NewMeasurePageProps = {
  route: Route;
  location: Location;
};

export function NewMeasurePage({ route, location }: NewMeasurePageProps) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const tableIdParam = new URLSearchParams(location.search).get("tableId");
  const tableId = tableIdParam ? Number(tableIdParam) : undefined;

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);

  const [createMeasure, { isLoading: isSaving }] = useCreateMeasureMutation();

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      definition: DatasetQuery;
    }) => {
      if (!table) {
        return;
      }
      const { data: measure, error } = await createMeasure({
        name: data.name,
        table_id: table.id,
        definition: data.definition,
        description: data.description || undefined,
      });

      if (error) {
        sendErrorToast(t`Failed to create measure`);
      } else if (measure) {
        sendSuccessToast(t`Measure created`);
        dispatch(push(Urls.dataStudioMeasure(measure.id)));
      }
    },
    [table, createMeasure, dispatch, sendSuccessToast, sendErrorToast],
  );

  const handleCancel = useCallback(() => {
    if (table) {
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
  }, [table, dispatch]);

  if (isLoading || error || !table) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <MeasureEditorPage
      table={table}
      route={route}
      isSaving={isSaving}
      onSave={handleSave}
      onCancel={handleCancel}
      testId="new-measure-page"
    />
  );
}
