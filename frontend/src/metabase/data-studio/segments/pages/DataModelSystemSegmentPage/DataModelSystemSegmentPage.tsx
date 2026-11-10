import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
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
import {
  type ResolvedSystemSegment,
  type TableSegmentsModel,
  applyConditions,
  useTableSegmentsModel,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/table-segments";
import {
  SYSTEM_SEGMENT_ROLES,
  type SystemSegmentRole,
  getSystemSegmentColumnQuestion,
  getSystemSegmentCondition,
  getSystemSegmentMarkedWhen,
  getSystemSegmentMarkedWhenLabel,
  getSystemSegmentMissingColumnMessage,
  getSystemSegmentNotApplicableLabel,
  isSystemSegmentColumn,
} from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { useParams } from "metabase/router";
import { SegmentFilterEditor } from "metabase/segments";
import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { SegmentMoreMenu } from "../../components/SegmentMoreMenu";

const STAGE_INDEX = -1;

type SystemSegmentPageParams = {
  tableId: string;
  role: string;
};

type SystemSegmentBreadcrumbsProps = {
  table: Table;
  segment: ResolvedSystemSegment;
};

type SystemSegmentPageProps = {
  renderBreadcrumbs: (props: SystemSegmentBreadcrumbsProps) => ReactNode;
};

/** PROTOTYPE: mocked. A table's built-in segment, laid out like a segment's page. */
export function DataModelSystemSegmentPage() {
  return (
    <SystemSegmentPage
      renderBreadcrumbs={({ table, segment }) => (
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
      )}
    />
  );
}

export function SystemSegmentPage({
  renderBreadcrumbs,
}: SystemSegmentPageProps) {
  const params = useParams<SystemSegmentPageParams>();
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

  return (
    <SystemSegmentDetailPage
      key={role}
      table={table}
      role={role}
      renderBreadcrumbs={renderBreadcrumbs}
    />
  );
}

function SystemSegmentDetailPage({
  table,
  role,
  renderBreadcrumbs,
}: {
  table: Table;
  role: SystemSegmentRole;
} & SystemSegmentPageProps) {
  const model = useTableSegmentsModel(table);
  const segment = model.systemSegments.find(
    (systemSegment) => systemSegment.role === role,
  );
  const { sendSuccessToast } = useMetadataToasts();
  const readOnly = !table.can_write;
  const [
    isCustomFilterOpen,
    { open: openCustomFilter, close: closeCustomFilter },
  ] = useDisclosure(segment?.hasCustomFilter ?? false);
  // `undefined` until someone edits the custom filter
  const [customDraft, setCustomDraft] = useState<Lib.Query>();
  const columnForm = useColumnForm(table, segment);

  if (!segment) {
    return null;
  }

  const customQuery = customDraft ?? segment.query;
  const isCustomDirty =
    customDraft != null &&
    segment.query != null &&
    !Lib.areLegacyQueriesEqual(
      Lib.toJsQuery(customDraft),
      Lib.toJsQuery(segment.query),
    );
  const isDirty = isCustomFilterOpen ? isCustomDirty : columnForm.isDirty;
  const previewQuery = isCustomFilterOpen ? customQuery : segment.query;
  const previewUrl =
    previewQuery && Lib.filters(previewQuery, STAGE_INDEX).length > 0
      ? getDatasetQueryPreviewUrl(Lib.toJsQuery(previewQuery))
      : undefined;

  const handleSave = () => {
    if (isCustomFilterOpen) {
      model.setSystemSegmentQuery(role, customDraft);
      setCustomDraft(undefined);
    } else if (columnForm.condition) {
      model.setSystemSegmentCondition(role, columnForm.condition);
    }
    sendSuccessToast(t`Segment updated`);
  };

  const handleCancel = () => {
    setCustomDraft(undefined);
    columnForm.reset();
  };

  const handleResetToDefault = () => {
    model.setSystemSegmentCondition(role, undefined);
    model.setSystemSegmentQuery(role, undefined);
    setCustomDraft(undefined);
    closeCustomFilter();
    columnForm.reset();
    sendSuccessToast(t`Segment reset to its default`);
  };

  const handleTurnOff = () => {
    model.setSystemSegmentApplicable(role, false);
    sendSuccessToast(t`Turned off for this table`);
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
        breadcrumbs={renderBreadcrumbs({ table, segment })}
        actions={
          readOnly ? null : isDirty ? (
            <Group gap="sm">
              <Button onClick={handleCancel}>{t`Cancel`}</Button>
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
      <Card withBorder p="xxl" maw={720}>
        <Stack gap="xl">
          <Text c="text-secondary">{segment.description}</Text>
          {segment.status === "not-applicable" ? (
            <NotApplicableNotice
              role={role}
              readOnly={readOnly}
              onTurnOn={() => model.setSystemSegmentApplicable(role, true)}
            />
          ) : isCustomFilterOpen ? (
            <Stack gap="md">
              {customQuery && (
                <SegmentFilterEditor
                  query={customQuery}
                  onChange={setCustomDraft}
                  readOnly={readOnly}
                />
              )}
              {!readOnly && (
                <Box>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => {
                      setCustomDraft(undefined);
                      closeCustomFilter();
                    }}
                  >
                    {t`Pick a column instead`}
                  </Button>
                </Box>
              )}
            </Stack>
          ) : (
            <ColumnSetup
              role={role}
              segment={segment}
              model={model}
              form={columnForm}
              readOnly={readOnly}
              onUseCustomFilter={openCustomFilter}
              onTurnOff={handleTurnOff}
            />
          )}
        </Stack>
      </Card>
      {!readOnly && <LeaveRouteConfirmModal isEnabled={isDirty} />}
    </PageContainer>
  );
}

type ColumnForm = ReturnType<typeof useColumnForm>;

/** The marking column and the value that marks rows, before they're saved */
function useColumnForm(
  table: Table,
  segment: ResolvedSystemSegment | undefined,
) {
  const columns = useMemo(
    () => (table.fields ?? []).filter(isSystemSegmentColumn),
    [table.fields],
  );
  const savedFieldId = segment?.condition?.fieldId ?? null;
  const savedMarkedWhen =
    segment?.condition != null
      ? (getSystemSegmentMarkedWhen(segment.role, segment.condition) ?? true)
      : true;
  const [fieldId, setFieldId] = useState<FieldId | null>(savedFieldId);
  const [markedWhen, setMarkedWhen] = useState(savedMarkedWhen);
  const field = columns.find(
    (column) => getRawTableFieldId(column) === fieldId,
  );
  const condition =
    segment != null && field != null
      ? getSystemSegmentCondition(segment.role, field, markedWhen)
      : undefined;
  const isDirty =
    field != null &&
    (fieldId !== savedFieldId ||
      markedWhen !== savedMarkedWhen ||
      segment?.status === "guessed");

  return {
    columns,
    field,
    markedWhen,
    condition,
    isDirty,
    setFieldId,
    setMarkedWhen,
    reset: () => {
      setFieldId(savedFieldId);
      setMarkedWhen(savedMarkedWhen);
    },
  };
}

function ColumnSetup({
  role,
  segment,
  model,
  form,
  readOnly,
  onUseCustomFilter,
  onTurnOff,
}: {
  role: SystemSegmentRole;
  segment: ResolvedSystemSegment;
  model: TableSegmentsModel;
  form: ColumnForm;
  readOnly: boolean;
  onUseCustomFilter: () => void;
  onTurnOff: () => void;
}) {
  const { field } = form;

  return (
    <Stack gap="lg">
      {segment.status === "not-set-up" && field == null && (
        <Text c="feedback-warning">
          {getSystemSegmentMissingColumnMessage(role)}
        </Text>
      )}
      <Select
        label={getSystemSegmentColumnQuestion(role)}
        description={t`Yes/no and date columns`}
        placeholder={t`Choose a column`}
        data={form.columns.map((column) => ({
          value: String(getRawTableFieldId(column)),
          label: column.display_name,
        }))}
        value={field ? String(getRawTableFieldId(field)) : null}
        disabled={readOnly}
        searchable
        nothingFoundMessage={t`This table has no yes/no or date columns`}
        onChange={(value) => {
          const column = form.columns.find(
            (candidate) => String(getRawTableFieldId(candidate)) === value,
          );
          form.setFieldId(column ? getRawTableFieldId(column) : null);
        }}
      />
      {field && (
        <Stack gap="xs">
          <Text fw="bold">{getSystemSegmentMarkedWhenLabel(role)}</Text>
          <Box>
            <SegmentedControl
              data={getMarkedWhenOptions(field)}
              value={String(form.markedWhen)}
              disabled={readOnly}
              onChange={(value) => form.setMarkedWhen(value === "true")}
            />
          </Box>
        </Stack>
      )}
      {form.condition && model.baseQuery && (
        <RowCountPreview
          baseQuery={model.baseQuery}
          query={applyConditions(model.baseQuery, [form.condition])}
        />
      )}
      {!readOnly && (
        <Group gap="md">
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={onUseCustomFilter}
          >
            {t`Use a custom filter instead`}
          </Button>
          <Button variant="subtle" size="compact-sm" onClick={onTurnOff}>
            {getSystemSegmentNotApplicableLabel(role)}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function getMarkedWhenOptions(field: Field) {
  return isDate(field)
    ? [
        { value: "true", label: t`Set` },
        { value: "false", label: t`Empty` },
      ]
    : [
        { value: "true", label: t`True` },
        { value: "false", label: t`False` },
      ];
}

function useRowCount(query: Lib.Query) {
  const countQuery = useMemo(
    () => Lib.toJsQuery(Lib.aggregateByCount(query, STAGE_INDEX)),
    [query],
  );
  const { data } = useGetAdhocQueryQuery(countQuery);
  const count = data?.data.rows[0]?.[0];
  return typeof count === "number" ? count : undefined;
}

function RowCountPreview({
  baseQuery,
  query,
}: {
  baseQuery: Lib.Query;
  query: Lib.Query;
}) {
  const keptCount = useRowCount(query);
  const totalCount = useRowCount(baseQuery);

  return (
    <Card withBorder p="md" radius="md" shadow="none">
      <Text>
        {keptCount == null || totalCount == null
          ? t`Counting rows…`
          : t`Keeps ${keptCount.toLocaleString()} of ${totalCount.toLocaleString()} rows`}
      </Text>
    </Card>
  );
}

function NotApplicableNotice({
  role,
  readOnly,
  onTurnOn,
}: {
  role: SystemSegmentRole;
  readOnly: boolean;
  onTurnOn: () => void;
}) {
  return (
    <Stack gap="sm" align="flex-start">
      <Text fw="bold">{getSystemSegmentNotApplicableLabel(role)}</Text>
      <Text c="text-secondary">
        {t`This segment is turned off for this table, so it can't be a default segment or a group member.`}
      </Text>
      {!readOnly && <Button onClick={onTurnOn}>{t`Turn back on`}</Button>}
    </Stack>
  );
}
