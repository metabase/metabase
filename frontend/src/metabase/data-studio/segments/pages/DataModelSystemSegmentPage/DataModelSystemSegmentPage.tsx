import { useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useMetadataToasts } from "metabase/common/hooks";
import { modelIconMap } from "metabase/common/utils/icon";
import { DataModelBreadcrumbs } from "metabase/data-studio/common/components/DataModelBreadcrumbs";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { useTableSegmentsModel } from "metabase/data-studio/data-model/pages/DataModel/TableSection/table-segments";
import {
  SYSTEM_SEGMENT_ROLES,
  type SystemSegmentRole,
} from "metabase/metadata/table-segments";
import { useParams } from "metabase/router";
import { SegmentFilterEditor } from "metabase/segments";
import { Badge, Button, Card, Center, Group, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { SegmentMoreMenu } from "../../components/SegmentMoreMenu";

type DataModelSystemSegmentPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  role: string;
};

/** PROTOTYPE: mocked. A table's built-in segment, laid out like a segment's page. */
export function DataModelSystemSegmentPage() {
  const params = useParams<DataModelSystemSegmentPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);
  const role = SYSTEM_SEGMENT_ROLES.find(
    (systemRole) => systemRole === params.role,
  );
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || !role) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error ?? (role ? undefined : t`Segment not found`)}
        />
      </Center>
    );
  }

  return <SystemSegmentDetailPage key={role} table={table} role={role} />;
}

function SystemSegmentDetailPage({
  table,
  role,
}: {
  table: Table;
  role: SystemSegmentRole;
}) {
  const model = useTableSegmentsModel(table);
  const segment = model.systemSegments.find(
    (systemSegment) => systemSegment.role === role,
  );
  const { sendSuccessToast } = useMetadataToasts();
  // `undefined` until someone edits the filters
  const [draft, setDraft] = useState<Lib.Query>();
  const readOnly = !table.can_write;

  if (!segment) {
    return null;
  }

  const query = draft ?? segment.query;
  const isDirty =
    draft != null &&
    segment.query != null &&
    !Lib.areLegacyQueriesEqual(
      Lib.toJsQuery(draft),
      Lib.toJsQuery(segment.query),
    );
  const previewUrl =
    query && Lib.filters(query, -1).length > 0
      ? getDatasetQueryPreviewUrl(Lib.toJsQuery(query))
      : undefined;

  const handleSave = () => {
    model.setSystemSegmentQuery(role, draft);
    setDraft(undefined);
    sendSuccessToast(t`Segment updated`);
  };

  const handleResetToDefault = () => {
    model.setSystemSegmentQuery(role, undefined);
    setDraft(undefined);
    sendSuccessToast(t`Segment reset to its default`);
  };

  return (
    <PageContainer data-testid="system-segment-detail-page">
      <PaneHeader
        data-testid="segment-pane-header"
        title={
          <Group gap="sm" wrap="nowrap">
            <PanelHeaderTitle>{segment.label}</PanelHeaderTitle>
            <Badge variant="light">{t`System segment`}</Badge>
          </Group>
        }
        icon={modelIconMap.segment}
        menu={<SegmentMoreMenu previewUrl={previewUrl} />}
        breadcrumbs={
          <DataModelBreadcrumbs
            table={table}
            entityName={segment.label}
            newEntityLabel={t`New segment`}
            tableListUrl={Urls.dataStudioData({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
              tab: "segments",
            })}
          />
        }
        actions={
          readOnly ? null : isDirty ? (
            <Group gap="sm">
              <Button onClick={() => setDraft(undefined)}>{t`Cancel`}</Button>
              <Button variant="filled" onClick={handleSave}>
                {t`Save`}
              </Button>
            </Group>
          ) : (
            segment.isEdited && (
              <Button onClick={handleResetToDefault}>
                {t`Reset to default`}
              </Button>
            )
          )
        }
      />
      <Card withBorder p="xxl">
        <Stack gap="xxl">
          {query && (
            <SegmentFilterEditor
              query={query}
              onChange={setDraft}
              readOnly={readOnly}
            />
          )}
          <Stack gap="sm">
            <Text fw="bold">{t`Description`}</Text>
            <Text c="text-secondary">{segment.description}</Text>
          </Stack>
        </Stack>
      </Card>
      {!readOnly && <LeaveRouteConfirmModal isEnabled={isDirty} />}
    </PageContainer>
  );
}
