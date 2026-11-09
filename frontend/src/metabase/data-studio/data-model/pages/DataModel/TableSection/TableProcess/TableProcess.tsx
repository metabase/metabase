import { useCallback, useState } from "react";
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
  type TransitionKind,
  getProcessEncodingLabel,
  getValueBucketLabel,
  inferLifecycleField,
  inferStatusHistoryColumns,
  isTerminalBucket,
  useLifecycle,
} from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Badge,
  Group,
  Icon,
  List,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import { InferredValue } from "../InferenceReview";

import { BUCKET_BADGE_COLORS, TransitionsDiagram } from "./TransitionsDiagram";
import { TransitionsSankey } from "./TransitionsSankey";
import { TransitionsTable } from "./TransitionsTable";
import { useProcessModel } from "./use-process-model";

type TransitionsView = "diagram" | "sankey" | "list";

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
  } = model;
  const [transitionsView, setTransitionsView] =
    useState<TransitionsView>("list");
  const [isDiagramExpanded, setIsDiagramExpanded] = useState(false);
  // Stable, so the diagram's edges don't rebuild on every render
  const handleKindChange = useCallback(
    (key: string, kind: TransitionKind) => setTransitionKind(table, key, kind),
    [table, setTransitionKind],
  );

  return (
    <Stack gap="xxl">
      <SidebarSection
        title={t`Process`}
        description={t`How each record moves through its statuses: which column holds the status, where changes are recorded, and which moves between statuses are expected.`}
      >
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
          {/* Separate children, not a fragment: DetailsTable divides its direct children */}
          {history && (
            <DetailsRow
              label={t`History table entity key`}
              value={
                <HistoryColumnValue
                  fieldId={history.entityKeyFieldId}
                  historyTable={historyTable}
                />
              }
            />
          )}
          {history && (
            <DetailsRow
              label={t`History table Status column`}
              value={
                <HistoryColumnValue
                  fieldId={history.stateFieldId}
                  historyTable={historyTable}
                />
              }
            />
          )}
          {history && (
            <DetailsRow
              label={t`History table Changed At column`}
              value={
                <HistoryColumnValue
                  fieldId={history.changedAtFieldId}
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
        <SidebarSection
          title={t`Transitions`}
          titleAside={
            <Group gap="sm" wrap="nowrap">
              {transitionsView === "diagram" && (
                <Tooltip label={t`Expand`}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t`Expand the transitions diagram`}
                    onClick={() => setIsDiagramExpanded(true)}
                  >
                    <Icon name="expand" />
                  </ActionIcon>
                </Tooltip>
              )}
              <SegmentedControl<TransitionsView>
                data={[
                  { value: "list", label: t`List` },
                  { value: "diagram", label: t`Diagram` },
                  { value: "sankey", label: t`Sankey` },
                ]}
                value={transitionsView}
                onChange={setTransitionsView}
              />
            </Group>
          }
          description={t`Moves between statuses, from the order and from the status history when there is one.`}
        >
          {transitionsView === "diagram" && (
            <TransitionsDiagram
              states={order.values}
              rows={transitions}
              readOnly={readOnly}
              height={360}
              onKindChange={handleKindChange}
            />
          )}
          {transitionsView === "sankey" && (
            <TransitionsSankey
              states={order.values}
              rows={transitions}
              height={360}
            />
          )}
          {transitionsView === "list" && (
            <TransitionsTable
              rows={transitions}
              readOnly={readOnly}
              onKindChange={handleKindChange}
            />
          )}
          <Modal
            opened={isDiagramExpanded}
            title={t`Transitions`}
            size="90%"
            onClose={() => setIsDiagramExpanded(false)}
          >
            <TransitionsDiagram
              states={order.values}
              rows={transitions}
              readOnly={readOnly}
              height="75vh"
              onKindChange={handleKindChange}
            />
          </Modal>
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

/** One of the history table's bound columns, by name */
function HistoryColumnValue({
  fieldId,
  historyTable,
}: {
  fieldId: FieldId | null;
  historyTable: Table | undefined;
}) {
  const column = historyTable?.fields?.find((field) => idOf(field) === fieldId);
  return column ? (
    column.display_name
  ) : (
    <Text c="text-disabled">{t`Not found`}</Text>
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
        // In lifecycle order; final states carry how they end as a badge
        <List type="ordered" size="md" spacing={4}>
          {order.values.map(({ value, bucket }) => (
            <List.Item key={value}>
              <Group gap="xs" wrap="nowrap" display="inline-flex">
                {value}
                {isTerminalBucket(bucket) && (
                  <Badge
                    variant="light"
                    color={BUCKET_BADGE_COLORS[bucket]}
                    flex="0 0 auto"
                  >
                    {getValueBucketLabel(bucket)}
                  </Badge>
                )}
              </Group>
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
