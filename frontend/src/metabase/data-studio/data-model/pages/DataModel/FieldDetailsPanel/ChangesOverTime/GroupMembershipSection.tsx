import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  findColumnByName,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select } from "metabase/ui";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { ColumnSelect } from "./PastValuesRows";
import {
  type DimensionHistory,
  useDimensionHistory,
} from "./use-dimension-history";

const NOT_TRACKED = "none";
const TRACKED = "tracked";

export function isGroupMember(
  field: Field,
  history: DimensionHistory,
  getAttribute: ReturnType<typeof useChangingAttributes>["getAttribute"],
  table: Table,
) {
  const attribute = getAttribute(field, table, history.tables);
  return (
    !isPK(field) &&
    !isFK(field) &&
    history.historyTable != null &&
    attribute.source === "history-table" &&
    attribute.historyTableId === history.historyTable.id
  );
}

/** The fields listed under a dimension's history table in the field list */
export function useGroupMembers(table: Table) {
  const history = useDimensionHistory(table);
  const { getAttribute } = useChangingAttributes();
  const memberIds = (table.fields ?? [])
    .filter((field) => isGroupMember(field, history, getAttribute, table))
    .map(getRawTableFieldId);
  return { history, memberIds };
}

/**
 * PROTOTYPE: mocked. Moves a field into or out of the "Changes over time"
 * group in the field list, and picks its column in the history table when
 * the names don't match.
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
  const { getAttribute, setAttribute } = useChangingAttributes();
  const { historyTable } = history;
  if (historyTable == null) {
    return null;
  }
  const attribute = getAttribute(field, table, history.tables);
  const isMember = isGroupMember(field, history, getAttribute, table);

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`Tracked fields are listed together, under ${historyTable.display_name}.`}
    >
      <DetailsTable>
        <DetailsRow
          label={t`Old values`}
          fillValue
          value={
            <Select
              aria-label={t`Old values`}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              data={[
                { value: NOT_TRACKED, label: t`Not tracked` },
                {
                  value: TRACKED,
                  label: t`Tracked in ${historyTable.display_name}`,
                },
              ]}
              value={isMember ? TRACKED : NOT_TRACKED}
              disabled={disabled}
              onChange={(value) => {
                const column = findColumnByName(historyTable, field);
                setAttribute(
                  field,
                  value === TRACKED
                    ? {
                        source: "history-table",
                        historyTableId: historyTable.id,
                        valueFieldId: column
                          ? getRawTableFieldId(column)
                          : null,
                      }
                    : { source: "none", historyTableId: null },
                );
              }}
            />
          }
        />
        {isMember && (
          <DetailsRow
            label={t`Stored as`}
            fillValue
            value={
              <ColumnSelect
                label={t`Stored as`}
                fields={historyTable.fields ?? []}
                value={attribute.valueFieldId}
                placeholder={t`Pick its column in ${historyTable.display_name}`}
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
