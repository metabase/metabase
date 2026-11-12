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
  getHistoryTableCandidates,
  getVersionChoiceOptions,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select, Stack } from "metabase/ui";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import {
  EndUserPreview,
  type PreviewNames,
  getPreviewNames,
} from "./EndUserPreview";
import { ColumnSelect, PastValuesRows } from "./PastValuesRows";
import {
  useDimensionHistory,
  useHistoryTableBinding,
  useIsHistoryTable,
} from "./use-dimension-history";
import { useEndUserExample } from "./use-end-user-example";

type AttributeHistorySectionProps = {
  field: Field;
  table: Table;
  disabled: boolean;
};

export function useIsDimensionAttribute(field: Field, table: Table) {
  const isHistoryTable = useIsHistoryTable();
  return !isHistoryTable(table) && !isPK(field) && !isFK(field);
}

/**
 * PROTOTYPE: mocked. Whether a dimension attribute keeps its old values, in
 * which history table, and which value people get when they group facts by it.
 */
export function AttributeHistorySection({
  field,
  table,
  disabled,
}: AttributeHistorySectionProps) {
  const history = useDimensionHistory(table);
  const isHistoryTable = useIsHistoryTable();
  const getBinding = useHistoryTableBinding();
  const { getAttribute, setAttribute } = useChangingAttributes();
  const attribute = getAttribute(field, table, history.tables);
  const candidates = getHistoryTableCandidates(
    table,
    history.tables,
    isHistoryTable,
  ).filter((candidate) => findColumnByName(candidate, field) != null);
  const historyTable =
    attribute.source === "history-table"
      ? history.tables.find((other) => other.id === attribute.historyTableId)
      : undefined;
  const names = getPreviewNames(history, table, field);
  const example = useEndUserExample({
    binding: getBinding(table, historyTable),
    historyTable,
    valueField: findFieldById(historyTable, attribute.valueFieldId),
    dimensionTable: table,
    factTable: history.reference?.table,
    fkField: history.reference?.field,
    eventDateField: history.eventDateField,
  });

  return (
    <SidebarSection
      title={t`Changes over time`}
      description={t`Whether old values of ${field.display_name} are kept, and which one people get.`}
    >
      <Stack gap="lg">
        <DetailsTable>
          <PastValuesRows
            candidates={candidates}
            historyTable={historyTable}
            notKeptLabel={t`Not kept: a change overwrites it`}
            disabled={disabled}
            onChange={(next) =>
              setAttribute(field, {
                source: next ? "history-table" : "none",
                historyTableId: next?.id ?? null,
                valueFieldId: getColumnIdByName(next, field),
              })
            }
          />
          {historyTable != null && (
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
        {historyTable != null && history.reference != null && (
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

function getColumnIdByName(historyTable: Table | undefined, field: Field) {
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
