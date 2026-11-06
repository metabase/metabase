import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
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
import {
  DefaultSelectItem,
  Icon,
  MultiSelect,
  Select,
  SelectItem,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import { InferredValue } from "../InferenceReview";

import { HistoryShapeExample } from "./HistoryShapeExample";
import {
  type ExampleSource,
  getChangeShapeExample,
  getHistoryShapeExample,
} from "./history-shape-example";
import { type ScdDetails, useScdDetails } from "./use-scd-details";

const OPTION_TOOLTIP_OFFSET = 16;

function ShapeOptionItem({
  label,
  selected,
  disabled,
  example,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  example: ReactNode;
}) {
  const [isExampleShown, { open: showExample, close: hideExample }] =
    useDisclosure(false);
  return (
    <Tooltip
      label={example}
      opened={isExampleShown}
      position="left"
      offset={OPTION_TOOLTIP_OFFSET}
      maw="none"
      p="md"
    >
      <SelectItem selected={selected} disabled={disabled} w="100%">
        <Text c="inherit" lh="inherit" flex={1}>
          {label}
        </Text>
        <Icon
          name="info"
          c="text-secondary"
          flex="0 0 auto"
          aria-label={t`Example`}
          onMouseEnter={showExample}
          onMouseLeave={hideExample}
        />
      </SelectItem>
    </Tooltip>
  );
}

function ShapeSelect<T extends string>({
  label,
  options,
  value,
  disabledValues = [],
  disabled,
  isOpenOnMount = false,
  renderExample,
  onChange,
}: {
  label: string;
  options: ShapeOption<T>[];
  value: T;
  disabledValues?: T[];
  disabled: boolean;
  isOpenOnMount?: boolean;
  renderExample: (option: ShapeOption<T>) => ReactNode;
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
      renderOption={({ option, checked }) => {
        const shapeOption = options.find(({ value }) => value === option.value);
        return shapeOption ? (
          <ShapeOptionItem
            label={shapeOption.label}
            selected={checked ?? false}
            disabled={option.disabled}
            example={renderExample(shapeOption)}
          />
        ) : (
          <DefaultSelectItem {...option} selected={checked} />
        );
      }}
      onChange={(selected) => {
        const option = options.find(({ value }) => value === selected);
        if (option) {
          onChange(option.value);
        }
      }}
    />
  );
}

function InferredShapeSelect<T extends string>({
  label,
  options,
  value,
  inference,
  isInferred,
  disabledValues,
  disabled,
  renderExample,
  onConfirm,
  onChange,
}: {
  label: string;
  options: ShapeOption<T>[];
  value: T;
  inference: string | null;
  isInferred: boolean;
  disabledValues?: T[];
  disabled: boolean;
  renderExample: (option: ShapeOption<T>) => ReactNode;
  onConfirm: () => void;
  onChange: (value: T) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (isInferred) {
    return (
      <InferredValue
        value={options.find((option) => option.value === value)?.label ?? ""}
        inference={inference}
        readOnly={disabled}
        onConfirm={onConfirm}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onConfirm();
        }}
      />
    );
  }

  return (
    <ShapeSelect
      label={label}
      options={options}
      value={value}
      disabledValues={disabledValues}
      disabled={disabled}
      isOpenOnMount={isSelectOpenOnMount}
      renderExample={renderExample}
      onChange={onChange}
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
  isInferred,
  hasDateRange,
  exampleSource,
  disabled,
  onConfirm,
  onChange,
}: {
  shape: HistoryShape;
  exampleSource: ExampleSource;
  inference: string | null;
  isInferred: boolean;
  hasDateRange: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onChange: (shape: HistoryShape) => void;
}) {
  return (
    <InferredShapeSelect
      label={t`History`}
      options={getHistoryShapeOptions()}
      value={shape}
      inference={inference}
      isInferred={isInferred}
      disabledValues={hasDateRange ? [] : ["versions-with-dates"]}
      disabled={disabled}
      renderExample={(option) => (
        <HistoryShapeExample
          description={option.description}
          example={getHistoryShapeExample(option.value, exampleSource)}
        />
      )}
      onConfirm={onConfirm}
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
  const pair = previousValuePairs[0];
  const keyField = (table.fields ?? []).find(isPK);
  return (
    <SidebarSection title={t`History`}>
      <DetailsTable>
        <DetailsRow
          label={t`Changes`}
          fillValue
          value={
            <InferredShapeSelect
              label={t`Changes`}
              options={getChangeShapeOptions()}
              value={shape}
              inference={t`Inferred: ${resolution.signal}`}
              isInferred={!resolution.isOverridden}
              disabled={disabled}
              renderExample={(option) => (
                <HistoryShapeExample
                  description={option.description}
                  example={getChangeShapeExample(option.value, {
                    keyName: keyField?.display_name ?? t`ID`,
                    attributeName: pair?.field.display_name ?? t`Value`,
                    previousAttributeName:
                      pair?.previousField.display_name ?? t`Previous value`,
                  })}
                />
              )}
              onConfirm={() => setScdType(table, resolution.scdType)}
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
