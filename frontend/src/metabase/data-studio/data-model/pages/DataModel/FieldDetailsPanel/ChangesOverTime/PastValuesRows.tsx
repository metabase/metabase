import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { findFieldById } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Anchor, Select, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Field, FieldId, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

const NOT_KEPT = "none";

type PastValuesRowsProps = {
  candidates: Table[];
  historyTable: Table | undefined;
  notKeptLabel: string;
  disabled: boolean;
  onChange: (historyTable: Table | undefined) => void;
};

/**
 * Which history table keeps a dimension's past values. Its key and dates are
 * set once, on that table's History tab.
 */
export function PastValuesRows({
  candidates,
  historyTable,
  notKeptLabel,
  disabled,
  onChange,
}: PastValuesRowsProps) {
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
              ...candidates.map((table) => ({
                value: String(table.id),
                label: t`Kept in ${table.display_name}`,
              })),
            ]}
            value={historyTable != null ? String(historyTable.id) : NOT_KEPT}
            disabled={disabled}
            onChange={(value) =>
              onChange(candidates.find((table) => String(table.id) === value))
            }
          />
        }
      />
      {historyTable != null && (
        <DetailsRow
          label={t`Key and dates`}
          value={<HistorySettingsLink table={historyTable} />}
        />
      )}
    </>
  );
}

export function getHistorySettingsUrl(table: Table) {
  return table.is_published
    ? Urls.dataStudioTableHistory(table.id)
    : Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "history",
      });
}

export function HistorySettingsLink({ table }: { table: Table }) {
  return (
    <Text size="sm">
      {t`Set on`}{" "}
      <Anchor component={Link} to={getHistorySettingsUrl(table)}>
        {t`${table.display_name}'s History tab`}
      </Anchor>
    </Text>
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
