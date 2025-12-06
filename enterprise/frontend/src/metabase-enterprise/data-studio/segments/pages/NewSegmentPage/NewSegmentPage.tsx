import type { Location } from "history";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateSegmentMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { DatasetQuery } from "metabase-types/api";

import { SegmentEditorPage } from "../../components/SegmentEditorPage";

type NewSegmentPageProps = {
  route: Route;
  location: Location;
};

export function NewSegmentPage({ route, location }: NewSegmentPageProps) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const tableIdParam = new URLSearchParams(location.search).get("tableId");
  const tableId = tableIdParam ? Number(tableIdParam) : undefined;

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  const [createSegment, { isLoading: isSaving }] = useCreateSegmentMutation();

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      definition: DatasetQuery;
    }) => {
      if (!table) {
        return;
      }
      const { data: segment, error } = await createSegment({
        name: data.name,
        table_id: table.id,
        definition: data.definition,
        description: data.description || undefined,
      });

      if (error) {
        sendErrorToast(t`Failed to create segment`);
      } else if (segment) {
        sendSuccessToast(t`Segment created`);
        dispatch(push(Urls.dataStudioSegment(segment.id)));
      }
    },
    [table, createSegment, dispatch, sendSuccessToast, sendErrorToast],
  );

  const handleCancel = useCallback(() => {
    if (table) {
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
  }, [table, dispatch]);

  if (isLoading || error || !table) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentEditorPage
      table={table}
      route={route}
      isSaving={isSaving}
      onSave={handleSave}
      onCancel={handleCancel}
      testId="new-segment-page"
    />
  );
}
