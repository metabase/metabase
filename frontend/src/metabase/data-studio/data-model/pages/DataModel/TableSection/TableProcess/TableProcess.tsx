import { useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  type ResolvedValueOrder,
  type StatusHistoryBinding,
  TRANSITION_KINDS,
  type TransitionKind,
  getProcessEncodingLabel,
  getTransitionKindLabel,
  getValueBucketLabel,
  inferLifecycleField,
  inferStatusHistoryColumns,
  isTerminalBucket,
  useLifecycle,
} from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { List, Select, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import { InferredValue } from "../InferenceReview";

import { type TransitionRow, useProcessModel } from "./use-process-model";
interface TableProcessProps {
  table: Table;
  readOnly: boolean;
}

/**
 * PROTOTYPE: mocked. The Process tab: the table's status column, any status
 * history table, its milestones, the states in order, and the transitions
 * between them. The states are the status column's value order, edited in
 * that column's drawer.
 */
export function TableProcess({ table, readOnly }: TableProcessProps) {
  const model = useProcessModel(table);
  const { setStatusFieldId, setStatusHistory, setTransitionKind } =
    useLifecycle();
  const {
    fields,
    schemaTables,
    overrides,
    inferredStatusField,
    statusField,
    milestones,
    order,
    historyInference,
    history,
    historyTable,
    encoding,
    transitions,
    unexpectedSeen,
  } = model;

  return (
    <Stack gap="xxl">
      <SidebarSection title={t`Process`}>
        <Text size="sm" c="text-secondary">
          {t`How each record moves through its statuses: which column holds the status, where changes are recorded, and which moves between statuses are expected.`}
        </Text>
        <DetailsTable>
          <DetailsRow
            label={t`Status column`}
            fillValue
            value={
              <StatusColumnValue
                fields={fields}
                statusField={statusField}
                isInferred={
                  overrides.statusFieldId === undefined &&
                  inferredStatusField != null
                }
                disabled={readOnly}
                onChange={(fieldId) => setStatusFieldId(table, fieldId)}
              />
            }
          />
          <DetailsRow
            label={t`Status history table`}
            fillValue
            value={
              <StatusHistoryValue
                table={table}
                schemaTables={schemaTables}
                history={history}
                historyTable={historyTable}
                inference={
                  overrides.history === undefined && historyInference
                    ? t`Inferred: ${historyInference.signal}`
                    : null
                }
                disabled={readOnly}
                onChange={(binding) => setStatusHistory(table, binding)}
              />
            }
          />
          {history && (
            <DetailsRow
              label={t`Status history columns`}
              value={
                <HistoryColumnsValue
                  binding={history}
                  historyTable={historyTable}
                />
              }
            />
          )}
          <DetailsRow
            label={t`Milestones`}
            value={
              milestones.length > 0 ? (
                milestones.map(({ display_name }) => display_name).join(", ")
              ) : (
                <Text c="text-secondary">{t`No milestone dates`}</Text>
              )
            }
          />
          <DetailsRow
            label={t`Recorded as`}
            value={getProcessEncodingLabel(encoding)}
          />
          <DetailsRow
            label={t`States`}
            value={
              <StatesValue
                table={table}
                statusField={statusField}
                order={order}
              />
            }
          />
        </DetailsTable>
      </SidebarSection>
      {transitions.length > 0 && (
        <SidebarSection title={t`Transitions`}>
          <Text size="sm" c="text-secondary">
            {unexpectedSeen.length > 0
              ? // The spec's data note: the most common move nobody expects
                t`${unexpectedSeen[0].count} records went from ${unexpectedSeen[0].from} to ${unexpectedSeen[0].to}, which isn't expected.`
              : t`Moves between statuses, from the order and from the status history when there is one.`}
          </Text>
          <DetailsTable>
            {transitions.map((row) => (
              <DetailsRow
                key={row.key}
                label={`${row.from} → ${row.to}`}
                fillValue
                labelNote={
                  row.count > 0 && (
                    <Text size="sm" c="text-secondary">
                      {t`${row.count} seen`}
                    </Text>
                  )
                }
                value={
                  <TransitionKindValue
                    row={row}
                    disabled={readOnly}
                    onChange={(kind) => setTransitionKind(table, row.key, kind)}
                  />
                }
              />
            ))}
          </DetailsTable>
        </SidebarSection>
      )}
    </Stack>
  );
}

const idOf = (field: Field) => getRawTableFieldId(field);

function StatusColumnValue({
  fields,
  statusField,
  isInferred,
  disabled,
  onChange,
}: {
  fields: Field[];
  statusField: Field | undefined;
  isInferred: boolean;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (isInferred && statusField) {
    const fieldId = idOf(statusField);
    const signal = inferLifecycleField(statusField)?.signal;
    return (
      <InferredValue
        value={statusField.display_name}
        inference={signal ? t`Inferred: ${signal}` : null}
        readOnly={disabled}
        onConfirm={() => onChange(fieldId)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(fieldId);
        }}
        data-testid="process-status-column-review"
      />
    );
  }

  return (
    <Select
      aria-label={t`Status column`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => ({
        value: String(idOf(field)),
        label: field.display_name,
      }))}
      value={statusField ? String(idOf(statusField)) : null}
      placeholder={t`No status column`}
      searchable
      clearable
      disabled={disabled}
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(value) => onChange(value != null ? Number(value) : null)}
      data-testid="process-status-column-select"
    />
  );
}

function StatusHistoryValue({
  table,
  schemaTables,
  history,
  historyTable,
  inference,
  disabled,
  onChange,
}: {
  table: Table;
  schemaTables: Table[];
  history: StatusHistoryBinding | null;
  historyTable: Table | undefined;
  /** Set while the history table is sync's guess */
  inference: string | null;
  disabled: boolean;
  onChange: (binding: StatusHistoryBinding | null) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (inference && history && historyTable) {
    return (
      <InferredValue
        value={historyTable.display_name}
        inference={inference}
        readOnly={disabled}
        onConfirm={() => onChange(history)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(history);
        }}
        data-testid="process-status-history-review"
      />
    );
  }

  return (
    <Select
      aria-label={t`Status history table`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={schemaTables
        .filter(({ id }) => id !== table.id)
        .map((schemaTable) => ({
          value: String(schemaTable.id),
          label: schemaTable.display_name,
        }))}
      value={history ? String(history.tableId) : null}
      placeholder={t`No status history table`}
      searchable
      clearable
      disabled={disabled}
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(value) => {
        const picked = schemaTables.find(({ id }) => String(id) === value);
        // Its entity key, state, and changed-at columns are inferred
        onChange(picked ? inferStatusHistoryColumns(picked, table) : null);
      }}
      data-testid="process-status-history-select"
    />
  );
}

/** The history table's entity key, status, and changed-at columns */
function HistoryColumnsValue({
  binding,
  historyTable,
}: {
  binding: StatusHistoryBinding;
  historyTable: Table | undefined;
}) {
  const nameOf = (fieldId: FieldId | null) =>
    historyTable?.fields?.find((field) => idOf(field) === fieldId)
      ?.display_name ?? t`Not found`;
  const columns = [
    { label: t`Entity key`, fieldId: binding.entityKeyFieldId },
    { label: t`Status`, fieldId: binding.stateFieldId },
    { label: t`Changed at`, fieldId: binding.changedAtFieldId },
  ];
  return (
    <Stack gap={0} py="xs">
      {columns.map(({ label, fieldId }) => (
        <Text key={label}>
          <Text span c="text-secondary">
            {t`${label}: `}
          </Text>
          {nameOf(fieldId)}
        </Text>
      ))}
    </Stack>
  );
}

/** Open states in order, then the final ones by bucket */
function StatesValue({
  table,
  statusField,
  order,
}: {
  table: Table;
  statusField: Field | undefined;
  order: ResolvedValueOrder;
}) {
  if (!statusField) {
    return <Text c="text-secondary">{t`Pick a status column`}</Text>;
  }
  return (
    <Stack gap="xs" py="xs">
      {order.values.length === 0 ? (
        <Text c="text-secondary">{t`No cached values`}</Text>
      ) : (
        // In lifecycle order; final states say how they end
        <List type="ordered" size="md" spacing={0}>
          {order.values.map(({ value, bucket }) => (
            <List.Item key={value}>
              {value}
              {isTerminalBucket(bucket) && (
                <Text span c="text-secondary">
                  {` · ${getValueBucketLabel(bucket)}`}
                </Text>
              )}
            </List.Item>
          ))}
        </List>
      )}
      <Link
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab: "field",
          fieldId: idOf(statusField),
        })}
      >
        <Text size="sm" c="text-brand">
          {t`Edit the order in ${statusField.display_name}`}
        </Text>
      </Link>
    </Stack>
  );
}

function TransitionKindValue({
  row,
  disabled,
  onChange,
}: {
  row: TransitionRow;
  disabled: boolean;
  onChange: (kind: TransitionKind) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (!row.isOverridden) {
    return (
      <InferredValue
        value={getTransitionKindLabel(row.kind)}
        inference={t`Inferred: ${row.signal}`}
        readOnly={disabled}
        onConfirm={() => onChange(row.kind)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(row.kind);
        }}
      />
    );
  }

  return (
    <Select
      aria-label={t`Transition from ${row.from} to ${row.to}`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={TRANSITION_KINDS.map((kind) => ({
        value: kind,
        label: getTransitionKindLabel(kind),
      }))}
      value={row.resolvedKind}
      allowDeselect={false}
      disabled={disabled}
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(value) => {
        const kind = TRANSITION_KINDS.find((known) => known === value);
        if (kind) {
          onChange(kind);
        }
      }}
    />
  );
}
