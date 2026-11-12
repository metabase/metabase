import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type VersionChoice,
  findColumnByName,
  getHistoryTableCandidates,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select, Stack } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { ColumnSelect } from "./PastValuesRows";
import { singularName } from "./names";
import {
  useDimensionHistory,
  useIsHistoryTable,
} from "./use-dimension-history";

const OVERWRITTEN = "overwritten";
const KEPT = "kept";

const getValueUsedOptions = (): { value: VersionChoice; label: string }[] => [
  { value: "at-event", label: t`At the time of each row` },
  { value: "current", label: t`Today's value` },
];

type ChangeBehaviorSectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

/**
 * PROTOTYPE: mocked. How an attribute behaves when it changes: overwritten,
 * or kept, and then which value other tables use and where old values are
 * kept.
 */
export function ChangeBehaviorSection({
  field,
  table,
  disabled,
}: ChangeBehaviorSectionProps) {
  const history = useDimensionHistory(table);
  const isHistoryTable = useIsHistoryTable();
  const { getAttribute, setAttribute } = useChangingAttributes();
  const attribute = getAttribute(field, table, history.tables);
  const valueUsedOptions = getValueUsedOptions();
  const attributeName = field.display_name.toLowerCase();
  const entityName = singularName(table.display_name).toLowerCase();
  const isKept = attribute.source === "history-table";
  const candidates = getHistoryTableCandidates(
    table,
    history.tables,
    isHistoryTable,
  );
  const storageTable = isKept
    ? history.tables.find((other) => other.id === attribute.historyTableId)
    : undefined;

  const keepOldValues = () => {
    const inferredTable = candidates.find(
      (candidate) => findColumnByName(candidate, field) != null,
    );
    const column = findColumnByName(inferredTable, field);
    setAttribute(field, {
      source: "history-table",
      historyTableId: inferredTable?.id ?? null,
      valueFieldId: column ? getRawTableFieldId(column) : null,
    });
  };

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`What happens when a ${entityName}'s ${attributeName} changes.`}
    >
      <Stack gap="sm">
        <DetailsTable>
          <DetailsRow
            label={t`When ${field.display_name} changes`}
            fillValue
            value={
              <Select
                aria-label={t`When ${field.display_name} changes`}
                classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                data={[
                  {
                    value: OVERWRITTEN,
                    label: t`The old value is overwritten`,
                  },
                  { value: KEPT, label: t`Old values are kept` },
                ]}
                value={isKept ? KEPT : OVERWRITTEN}
                disabled={disabled}
                onChange={(value) =>
                  value === KEPT
                    ? keepOldValues()
                    : setAttribute(field, {
                        source: "none",
                        historyTableId: null,
                      })
                }
              />
            }
          />
          {isKept && (
            <DetailsRow
              label={t`Value used in other tables`}
              fillValue
              value={
                <Select
                  aria-label={t`Value used in other tables`}
                  classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                  data={valueUsedOptions}
                  value={attribute.defaultVersion}
                  disabled={disabled}
                  onChange={(value) => {
                    const option = valueUsedOptions.find(
                      (option) => option.value === value,
                    );
                    if (option) {
                      setAttribute(field, { defaultVersion: option.value });
                    }
                  }}
                />
              }
            />
          )}
          {isKept && (
            <>
              <DetailsRow
                label={t`Kept in`}
                fillValue
                value={
                  <Select
                    aria-label={t`Kept in`}
                    classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                    searchable
                    placeholder={t`Pick the table with old values`}
                    data={history.tables
                      .filter((other) => other.id !== table.id)
                      .map((other) => ({
                        value: String(other.id),
                        label: other.display_name,
                      }))}
                    value={storageTable ? String(storageTable.id) : null}
                    disabled={disabled}
                    onChange={(value) => {
                      const next = history.tables.find(
                        (other) => String(other.id) === value,
                      );
                      const column = findColumnByName(next, field);
                      setAttribute(field, {
                        historyTableId: next?.id ?? null,
                        valueFieldId: column
                          ? getRawTableFieldId(column)
                          : null,
                      });
                    }}
                  />
                }
              />
              {storageTable != null && (
                <DetailsRow
                  label={t`Stored as`}
                  fillValue
                  value={
                    <ColumnSelect
                      label={t`Stored as`}
                      fields={storageTable.fields ?? []}
                      value={attribute.valueFieldId}
                      placeholder={t`Pick its column`}
                      disabled={disabled}
                      onChange={(valueFieldId) =>
                        setAttribute(field, { valueFieldId })
                      }
                    />
                  }
                />
              )}
            </>
          )}
        </DetailsTable>
      </Stack>
    </SidebarSection>
  );
}
