import { useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type FactKeyField,
  type HistoryShape,
  type PreviousValuePair,
  type ShapeOption,
  type TableStructure,
  getChangeShape,
  getChangeShapeOptions,
  getHistoryShapeOptions,
  getHistorySignalLabel,
  getScdTypeForChangeShape,
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
import { InferredIcon, ReviewValue } from "../InferenceReview";

import { type ScdDetails, useScdDetails } from "./use-scd-details";

function ShapeSelect<T extends string>({
  label,
  options,
  value,
  disabledValues = [],
  disabled,
  isOpenOnMount = false,
  onChange,
}: {
  label: string;
  options: ShapeOption<T>[];
  value: T;
  disabledValues?: T[];
  disabled: boolean;
  isOpenOnMount?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      aria-label={label}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={options.map((option) => ({
        value: option.value,
        label: option.label,
        disabled: disabledValues.includes(option.value),
      }))}
      value={value}
      allowDeselect={false}
      disabled={disabled}
      autoFocus={isOpenOnMount}
      defaultDropdownOpened={isOpenOnMount}
      renderOption={({ option }) => (
        <Stack gap={2} py={2}>
          <Text c="inherit">{option.label}</Text>
          <Text size="sm" c="text-secondary">
            {options.find(({ value }) => value === option.value)?.description}
          </Text>
        </Stack>
      )}
      onChange={(selected) => {
        const option = options.find(({ value }) => value === selected);
        if (option) {
          onChange(option.value);
        }
      }}
    />
  );
}

export function getHistoryShapeInference(
  structure: Pick<TableStructure, "scdTypeInference">,
  { resolution }: Pick<ScdDetails, "resolution">,
): string | null {
  if (resolution.isOverridden) {
    return null;
  }
  const { rule, signal } = structure.scdTypeInference;
  return resolution.signal === signal
    ? t`Inferred from ${getHistorySignalLabel(rule)}: ${signal}`
    : t`Inferred: ${resolution.signal}`;
}

export function HistoryShapeValue({
  shape,
  inference,
  isUnderReview,
  hasDateRange,
  disabled,
  onConfirm,
  onChange,
}: {
  shape: HistoryShape;
  inference: string | null;
  isUnderReview: boolean;
  hasDateRange: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onChange: (shape: HistoryShape) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);
  const options = getHistoryShapeOptions();

  if (isUnderReview) {
    return (
      <ReviewValue
        value={options.find(({ value }) => value === shape)?.label ?? ""}
        inference={inference}
        onConfirm={onConfirm}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onConfirm();
        }}
        data-testid="table-history-shape-review"
      />
    );
  }

  return (
    <ShapeSelect
      label={t`History`}
      options={options}
      value={shape}
      disabledValues={hasDateRange ? [] : ["versions-with-dates"]}
      disabled={disabled}
      isOpenOnMount={isSelectOpenOnMount}
      onChange={onChange}
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
  const shape = getChangeShape(resolution.scdType);
  return (
    <SidebarSection title={t`History`}>
      <DetailsTable>
        <DetailsRow
          label={t`Changes`}
          fillValue
          labelAside={
            !resolution.isOverridden && (
              <InferredIcon description={t`Inferred: ${resolution.signal}`} />
            )
          }
          value={
            <ShapeSelect
              label={t`Changes`}
              options={getChangeShapeOptions()}
              value={shape}
              disabled={disabled}
              onChange={(shape) =>
                setScdType(table, getScdTypeForChangeShape(shape))
              }
            />
          }
        />
        {shape === "previous-value" && previousValuePairs.length > 0 && (
          <DetailsRow
            label={t`Previous values`}
            value={<PreviousValueList pairs={previousValuePairs} />}
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}
