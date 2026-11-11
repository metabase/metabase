import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type VersionChoice,
  findColumnByName,
  findFieldById,
  getReferencingFields,
  getVersionChoiceOptions,
  inferEventDateField,
  isHistoryTableName,
  isRoleA,
  useChangingAttributes,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select, Stack } from "metabase/ui";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import { EndUserPreview, type PreviewNames } from "./EndUserPreview";
import { ColumnSelect, PastValuesRows } from "./PastValuesRows";
import { singularName } from "./names";
import { useEndUserExample } from "./use-end-user-example";

type AttributeHistorySectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

export function useCanChangeOverTime(field: Field, table: Table) {
  const { variant } = useChangingAttributes();
  const { role } = useTableStructures().getTableStructure(table);
  const isHistoryTable =
    isHistoryTableName(table) ||
    (role != null && isRoleA(role, "role/HistoryDimension"));
  return (
    variant === "attribute" && !isHistoryTable && !isPK(field) && !isFK(field)
  );
}

/**
 * PROTOTYPE: mocked. Whether a dimension attribute keeps its old values, where
 * they live, and which value people get when they group facts by it.
 */
export function AttributeHistorySection({
  field,
  table,
  disabled,
}: AttributeHistorySectionProps) {
  const { tables } = useSchemaTables(table);
  const { getAttribute, setAttribute } = useChangingAttributes();
  const attribute = getAttribute(field, table, tables);
  const historyTable = tables.find(
    (other) => other.id === attribute.historyTableId,
  );
  const isKept = attribute.source === "history-table" && historyTable != null;
  const reference = getReferencingFields(table, tables)[0];
  const eventDateField = reference && inferEventDateField(reference.table);
  const names: PreviewNames = {
    facts: reference?.table.display_name ?? t`Events`,
    fact: singularName(reference?.table.display_name ?? t`Event`),
    dimension: reference?.field.display_name ?? table.display_name,
    attribute: field.display_name,
    eventDate: eventDateField?.display_name ?? t`Date`,
  };
  const example = useEndUserExample({
    binding: attribute,
    historyTable,
    valueField: findFieldById(historyTable, attribute.valueFieldId),
    dimensionTable: table,
    factTable: reference?.table,
    fkField: reference?.field,
    eventDateField,
  });

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`Whether old values of ${field.display_name} are kept, and which one people get.`}
    >
      <Stack gap="lg">
        <DetailsTable>
          <PastValuesRows
            dimensionTable={table}
            tables={tables}
            binding={attribute}
            notKeptLabel={t`Not kept: a change overwrites it`}
            disabled={disabled}
            onChange={(update, nextHistoryTable) =>
              setAttribute(field, {
                ...update,
                ...(nextHistoryTable && {
                  valueFieldId: getColumnIdByName(nextHistoryTable, field),
                }),
              })
            }
          />
          {isKept && (
            <>
              <DetailsRow
                label={t`Stored as`}
                fillValue
                value={
                  <ColumnSelect
                    label={t`Stored as`}
                    fields={historyTable.fields ?? []}
                    value={attribute.valueFieldId}
                    disabled={disabled}
                    onChange={(valueFieldId) =>
                      setAttribute(field, { valueFieldId })
                    }
                  />
                }
              />
              <DetailsRow
                label={t`People get`}
                fillValue
                value={
                  <VersionSelect
                    names={names}
                    value={attribute.defaultVersion}
                    disabled={disabled}
                    onChange={(defaultVersion) =>
                      setAttribute(field, { defaultVersion })
                    }
                  />
                }
              />
            </>
          )}
        </DetailsTable>
        {isKept && reference && (
          <EndUserPreview
            names={names}
            version={attribute.defaultVersion}
            example={example}
          />
        )}
      </Stack>
    </SidebarSection>
  );
}

function getColumnIdByName(historyTable: Table, field: Field) {
  const column = findColumnByName(historyTable, field);
  return column ? getRawTableFieldId(column) : null;
}

export function VersionSelect({
  names,
  value,
  disabled,
  onChange,
}: {
  names: Pick<PreviewNames, "attribute" | "fact" | "eventDate">;
  value: VersionChoice;
  disabled: boolean;
  onChange: (value: VersionChoice) => void;
}) {
  const options = getVersionChoiceOptions(
    names.attribute.toLowerCase(),
    names.fact.toLowerCase(),
    names.eventDate.toLowerCase(),
  );
  return (
    <Select
      aria-label={t`People get`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={options.map(({ value, label }) => ({ value, label }))}
      value={value}
      disabled={disabled}
      onChange={(next) => {
        const option = options.find((option) => option.value === next);
        if (option) {
          onChange(option.value);
        }
      }}
    />
  );
}
