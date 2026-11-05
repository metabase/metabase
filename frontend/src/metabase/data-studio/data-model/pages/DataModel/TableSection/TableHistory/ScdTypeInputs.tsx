import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  CURRENT_TABLE_SCD_TYPES,
  type FactKeyField,
  type PreviousValuePair,
  type ScdType,
  getScdTypeLabel,
  isScdType,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { MultiSelect, Select, Stack, Text } from "metabase/ui";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import { InferredIcon } from "../InferenceReview";

import { useScdDetails } from "./use-scd-details";

export function ScdTypeSelect({
  types,
  value,
  disabled,
  onChange,
}: {
  types: readonly ScdType[];
  value: ScdType | null;
  disabled: boolean;
  onChange: (scdType: ScdType) => void;
}) {
  return (
    <Select
      aria-label={t`SCD type`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={types.map((type) => ({
        value: String(type),
        label: getScdTypeLabel(type),
      }))}
      value={value != null ? String(value) : null}
      allowDeselect={false}
      disabled={disabled}
      onChange={(value) => {
        const scdType = Number(value);
        if (isScdType(scdType)) {
          onChange(scdType);
        }
      }}
    />
  );
}

export function CurrentTableSelect({
  tables,
  value,
  disabled,
  onChange,
}: {
  tables: Table[];
  value: Table | undefined;
  disabled: boolean;
  onChange: (tableId: ConcreteTableId | null) => void;
}) {
  return (
    <Select
      aria-label={t`Current table`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={tables.map((table) => ({
        value: String(table.id),
        label: table.display_name,
      }))}
      value={value != null ? String(value.id) : null}
      placeholder={t`Choose the current table`}
      searchable
      clearable
      disabled={disabled}
      onChange={(value) => onChange(value != null ? Number(value) : null)}
    />
  );
}

export function CurrentValueFieldsInput({
  fields,
  value,
  disabled,
  onChange,
}: {
  fields: Field[];
  value: Field[];
  disabled: boolean;
  onChange: (fieldIds: FieldId[]) => void;
}) {
  return (
    <MultiSelect
      aria-label={t`Current values`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => ({
        value: String(getRawTableFieldId(field)),
        label: field.display_name,
      }))}
      value={value.map((field) => String(getRawTableFieldId(field)))}
      placeholder={value.length === 0 ? t`Choose columns` : undefined}
      searchable
      disabled={disabled}
      onChange={(values) => onChange(values.map(Number))}
    />
  );
}

export function FactKeyList({
  factKeyFields,
}: {
  factKeyFields: FactKeyField[];
}) {
  if (factKeyFields.length === 0) {
    return <Text c="text-secondary">{t`No fact table has this key`}</Text>;
  }
  return (
    <Stack gap={4}>
      {factKeyFields.map(({ table, field }) => (
        <Text key={`${table.id}:${getRawTableFieldId(field)}`}>
          {t`${table.display_name} · ${field.display_name}`}
        </Text>
      ))}
    </Stack>
  );
}

function PreviousValueList({ pairs }: { pairs: PreviousValuePair[] }) {
  return (
    <Stack gap={4}>
      {pairs.map(({ field, previousField }) => (
        <Text key={getRawTableFieldId(previousField)}>
          {t`${previousField.display_name} → ${field.display_name}`}
        </Text>
      ))}
    </Stack>
  );
}

export function PreviousValuesSection({
  table,
  disabled,
}: {
  table: Table;
  disabled: boolean;
}) {
  const { setScdType } = useTableStructures();
  const { isHistoryTable, resolution, previousValuePairs } =
    useScdDetails(table);
  const isShown =
    !isHistoryTable &&
    (previousValuePairs.length > 0 || resolution.isOverridden);
  if (!isShown) {
    return null;
  }
  return (
    <SidebarSection title={t`History`}>
      <DetailsTable>
        <DetailsRow
          label={t`SCD type`}
          fillValue
          labelAside={
            !resolution.isOverridden && (
              <InferredIcon description={t`Inferred: ${resolution.signal}`} />
            )
          }
          value={
            <ScdTypeSelect
              types={CURRENT_TABLE_SCD_TYPES}
              value={resolution.scdType}
              disabled={disabled}
              onChange={(scdType) => setScdType(table, scdType)}
            />
          }
        />
        {resolution.scdType === 3 && previousValuePairs.length > 0 && (
          <DetailsRow
            label={t`Previous values`}
            value={<PreviousValueList pairs={previousValuePairs} />}
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}
