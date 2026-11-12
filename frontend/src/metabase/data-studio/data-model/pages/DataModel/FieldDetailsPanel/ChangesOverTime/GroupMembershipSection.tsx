import { t } from "ttag";
import _ from "underscore";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  findColumnByName,
  getHistoryTableCandidates,
  useChangingAttributes,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select } from "metabase/ui";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { ColumnSelect } from "./PastValuesRows";
import {
  type DimensionHistory,
  useDimensionHistory,
  useIsHistoryTable,
} from "./use-dimension-history";

const NOT_TRACKED = "none";

export type FieldGroup = {
  historyTable: Table;
  memberIds: FieldId[];
};

/** The dimension's fields grouped by the table that keeps their old values */
export function useFieldGroups(table: Table): {
  history: DimensionHistory;
  groups: FieldGroup[];
} {
  const history = useDimensionHistory(table);
  const { getAttribute } = useChangingAttributes();
  const tracked = (table.fields ?? []).flatMap((field) => {
    if (isPK(field) || isFK(field)) {
      return [];
    }
    const attribute = getAttribute(field, table, history.tables);
    const historyTable = history.tables.find(
      (other) => other.id === attribute.historyTableId,
    );
    return attribute.source === "history-table" && historyTable
      ? [{ field, historyTable }]
      : [];
  });
  const byTable = _.groupBy(tracked, ({ historyTable }) =>
    String(historyTable.id),
  );
  const groups = Object.values(byTable).map((entries) => ({
    historyTable: entries[0].historyTable,
    memberIds: entries.map(({ field }) => getRawTableFieldId(field)),
  }));
  return {
    history,
    groups: _.sortBy(groups, ({ historyTable }) => historyTable.display_name),
  };
}

/**
 * PROTOTYPE: mocked. Which table keeps the field's old values, which moves
 * it into that table's group in the field list. Any table in the schema can
 * be picked; one that isn't a history table yet becomes one.
 */
export function GroupMembershipSection({
  field,
  table,
  disabled,
}: {
  field: Field;
  table: Table;
  disabled: boolean;
}) {
  const history = useDimensionHistory(table);
  const isHistoryTable = useIsHistoryTable();
  const { setTableRole } = useTableStructures();
  const { getAttribute, setAttribute } = useChangingAttributes();
  const attribute = getAttribute(field, table, history.tables);
  const historyTables = getHistoryTableCandidates(
    table,
    history.tables,
    isHistoryTable,
  );
  const otherTables = history.tables.filter(
    (other) =>
      other.id !== table.id &&
      !historyTables.some((candidate) => candidate.id === other.id),
  );
  const currentTable =
    attribute.source === "history-table"
      ? history.tables.find((other) => other.id === attribute.historyTableId)
      : undefined;
  const toOption = (other: Table) => ({
    value: String(other.id),
    label: other.display_name,
  });

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`Tracked fields are listed together, under the table that keeps their old values.`}
    >
      <DetailsTable>
        <DetailsRow
          label={t`Old values`}
          fillValue
          value={
            <Select
              aria-label={t`Old values`}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              searchable
              data={[
                {
                  group: "",
                  items: [{ value: NOT_TRACKED, label: t`Not tracked` }],
                },
                {
                  group: t`History tables`,
                  items: historyTables.map(toOption),
                },
                { group: t`Other tables`, items: otherTables.map(toOption) },
              ]}
              value={currentTable ? String(currentTable.id) : NOT_TRACKED}
              disabled={disabled}
              onChange={(value) => {
                const next = history.tables.find(
                  (other) => String(other.id) === value,
                );
                if (next == null) {
                  setAttribute(field, { source: "none", historyTableId: null });
                  return;
                }
                if (!isHistoryTable(next)) {
                  setTableRole(next, "role/HistoryDimension");
                }
                const column = findColumnByName(next, field);
                setAttribute(field, {
                  source: "history-table",
                  historyTableId: next.id,
                  valueFieldId: column ? getRawTableFieldId(column) : null,
                });
              }}
            />
          }
        />
        {currentTable != null && (
          <DetailsRow
            label={t`Stored as`}
            fillValue
            value={
              <ColumnSelect
                label={t`Stored as`}
                fields={currentTable.fields ?? []}
                value={attribute.valueFieldId}
                placeholder={t`Pick its column in ${currentTable.display_name}`}
                disabled={disabled}
                onChange={(valueFieldId) =>
                  setAttribute(field, { valueFieldId })
                }
              />
            }
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}
