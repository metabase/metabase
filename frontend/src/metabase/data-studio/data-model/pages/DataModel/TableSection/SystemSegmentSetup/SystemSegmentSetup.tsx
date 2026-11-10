import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  type FieldCondition,
  getSystemSegmentColumnQuestion,
  getSystemSegmentCondition,
  getSystemSegmentMarkedWhen,
  getSystemSegmentMarkedWhenLabel,
  getSystemSegmentMissingColumnMessage,
  isSystemSegmentColumn,
} from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Box,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { type ResolvedSystemSegment, applyConditions } from "../table-segments";

const STAGE_INDEX = -1;

export type SystemSegmentColumnForm = ReturnType<
  typeof useSystemSegmentColumnForm
>;

/** The marking column and the value that marks rows, before they're saved */
export function useSystemSegmentColumnForm(
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

/** Which column marks the segment's rows, which value marks them, and the rows it keeps */
export function SystemSegmentColumnFields({
  segment,
  baseQuery,
  form,
  readOnly,
}: {
  segment: ResolvedSystemSegment;
  baseQuery: Lib.Query | undefined;
  form: SystemSegmentColumnForm;
  readOnly: boolean;
}) {
  const { field } = form;

  return (
    <Stack gap="lg">
      {segment.status === "not-set-up" && field == null && (
        <Text c="text-secondary">
          {getSystemSegmentMissingColumnMessage(segment.role)}
        </Text>
      )}
      <Select
        label={getSystemSegmentColumnQuestion(segment.role)}
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
          <Text fw="bold">{getSystemSegmentMarkedWhenLabel(segment.role)}</Text>
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
      {form.condition && baseQuery && (
        <RowCountPreview baseQuery={baseQuery} condition={form.condition} />
      )}
    </Stack>
  );
}

/**
 * Sets up a system segment from somewhere else, like the default segment
 * picker. Saving hands back the condition; closing changes nothing.
 */
export function SystemSegmentSetupModal({
  table,
  segment,
  baseQuery,
  saveLabel,
  onSave,
  onClose,
}: {
  table: Table;
  segment: ResolvedSystemSegment;
  baseQuery: Lib.Query | undefined;
  saveLabel: string;
  onSave: (condition: FieldCondition) => void;
  onClose: () => void;
}) {
  const form = useSystemSegmentColumnForm(table, segment);

  return (
    <Modal
      opened
      title={t`Set up ${segment.label}`}
      size="lg"
      onClose={onClose}
    >
      <Stack gap="xl">
        <Text c="text-secondary">{segment.description}</Text>
        <SystemSegmentColumnFields
          segment={segment}
          baseQuery={baseQuery}
          form={form}
          readOnly={false}
        />
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={form.condition == null}
            onClick={() => {
              if (form.condition) {
                onSave(form.condition);
              }
            }}
          >
            {saveLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
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
  condition,
}: {
  baseQuery: Lib.Query;
  condition: FieldCondition;
}) {
  const query = useMemo(
    () => applyConditions(baseQuery, [condition]),
    [baseQuery, condition],
  );
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
