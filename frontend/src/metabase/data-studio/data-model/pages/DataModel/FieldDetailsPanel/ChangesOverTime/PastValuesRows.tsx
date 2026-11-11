import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import {
  type PastValuesBinding,
  findFieldById,
  getHistoryTableCandidates,
  inferBindingForHistoryTable,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Select } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

const NOT_KEPT = "none";

type PastValuesRowsProps = {
  dimensionTable: Table;
  tables: Table[];
  binding: PastValuesBinding;
  notKeptLabel: string;
  disabled: boolean;
  onChange: (update: Partial<PastValuesBinding>, historyTable?: Table) => void;
};

/**
 * Where a dimension's past values live: a history table, matched to the
 * dimension by a key, with the dates each value was true.
 */
export function PastValuesRows({
  dimensionTable,
  tables,
  binding,
  notKeptLabel,
  disabled,
  onChange,
}: PastValuesRowsProps) {
  const candidates = getHistoryTableCandidates(dimensionTable, tables);
  const others = tables.filter(
    (table) =>
      table.id !== dimensionTable.id &&
      !candidates.some((candidate) => candidate.id === table.id),
  );
  const historyTable = tables.find(
    (table) => table.id === binding.historyTableId,
  );
  const isKept = binding.source === "history-table" && historyTable != null;

  return (
    <>
      <DetailsRow
        label={t`Past values`}
        fillValue
        value={
          <Select
            aria-label={t`Past values`}
            classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
            data={[
              { value: NOT_KEPT, label: notKeptLabel },
              ...[...candidates, ...others].map((table) => ({
                value: String(table.id),
                label: t`Kept in ${table.display_name}`,
              })),
            ]}
            value={isKept ? String(historyTable.id) : NOT_KEPT}
            disabled={disabled}
            onChange={(value) => {
              const next = tables.find((table) => String(table.id) === value);
              if (next == null) {
                onChange({ source: "none" });
                return;
              }
              onChange(
                {
                  source: "history-table",
                  ...inferBindingForHistoryTable(dimensionTable, next),
                },
                next,
              );
            }}
          />
        }
      />
      {isKept && (
        <>
          <DetailsRow
            label={t`Matched on`}
            fillValue
            value={
              <ColumnSelect
                label={t`Matched on`}
                fields={historyTable.fields ?? []}
                value={binding.keyFieldId}
                disabled={disabled}
                onChange={(keyFieldId) => onChange({ keyFieldId })}
              />
            }
          />
          <DetailsRow
            label={t`True from`}
            fillValue
            value={
              <ColumnSelect
                label={t`True from`}
                fields={historyTable.fields ?? []}
                value={binding.validFromFieldId}
                disabled={disabled}
                onChange={(validFromFieldId) => onChange({ validFromFieldId })}
              />
            }
          />
          <DetailsRow
            label={t`True until`}
            fillValue
            value={
              <ColumnSelect
                label={t`True until`}
                fields={historyTable.fields ?? []}
                value={binding.validToFieldId}
                placeholder={t`The next change`}
                disabled={disabled}
                onChange={(validToFieldId) => onChange({ validToFieldId })}
              />
            }
          />
        </>
      )}
    </>
  );
}

export function ColumnSelect({
  label,
  fields,
  value,
  placeholder = t`Choose a column`,
  disabled,
  onChange,
}: {
  label: string;
  fields: Field[];
  value: FieldId | null;
  placeholder?: string;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <Select
      aria-label={label}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => ({
        value: String(getRawTableFieldId(field)),
        label: field.display_name,
      }))}
      value={findFieldById({ fields }, value) != null ? String(value) : null}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(next) => onChange(next != null ? Number(next) : null)}
    />
  );
}
