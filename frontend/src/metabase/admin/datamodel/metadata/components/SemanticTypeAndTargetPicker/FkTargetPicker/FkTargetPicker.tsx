import { t } from "ttag";

import { Flex, Icon, Select, SelectItem, Text } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldId } from "metabase-types/api";

import S from "./FkTargetPicker.module.css";

interface Props {
  className?: string;
  field: Field;
  idFields: Field[];
  value: FieldId | null;
  onChange: (value: FieldId | null) => void;
}

export const FkTargetPicker = ({
  className,
  field,
  idFields,
  value,
  onChange,
}: Props) => {
  const comparableIdFields = idFields.filter((idField: Field) => {
    return field.isComparableWith(idField);
  });
  const hasIdFields = comparableIdFields.length > 0;
  const includeSchema = hasMultipleSchemas(comparableIdFields);
  const data = getData(comparableIdFields, includeSchema);

  const getField = (fieldId: FieldId | null) => {
    const option = data.find(option => parseValue(option.value) === fieldId);
    return option?.field;
  };

  const handleChange = (value: string) => {
    const parsedValue = parseValue(value);
    onChange(parsedValue);
  };

  return (
    <Select
      className={className}
      classNames={{
        dropdown: S.dropdown,
      }}
      comboboxProps={{
        position: "bottom-start",
      }}
      data={data}
      data-testid="fk-target-select"
      disabled={!hasIdFields}
      filter={({ options, search }) => {
        const query = search.toLowerCase().trim();

        return options.filter(option => {
          if ("group" in option) {
            return false;
          }

          const field = getField(parseValue(option.value));

          if (!field) {
            return false;
          }

          return (
            field.display_name.includes(query) ||
            field.table?.display_name.includes(query) ||
            field.table?.schema_name?.includes(query)
          );
        });
      }}
      fw="bold"
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={getFkFieldPlaceholder(field, comparableIdFields)}
      renderOption={item => {
        const field = getField(parseValue(item.option.value));
        const selected = parseValue(item.option.value) === value;

        return (
          <SelectItem selected={selected}>
            <Icon name={selected ? "check" : "empty"} />

            <Flex direction="column" flex="1" gap="xs">
              <Text c="inherit" lh="1rem">
                {item.option.label}
              </Text>

              {field?.description && (
                <Text c="text-tertiary" className={S.description} lh="1rem">
                  {field.description}
                </Text>
              )}
            </Flex>
          </SelectItem>
        );
      }}
      searchable
      value={stringifyValue(value)}
      onChange={handleChange}
    />
  );
};

function getData(comparableIdFields: Field[], includeSchema: boolean) {
  return comparableIdFields.map(field => ({
    field,
    label: field.displayName({ includeTable: true, includeSchema }),
    value:
      typeof field.id === "object" && field.id != null
        ? "" // we don't expect field references here, this should never happen
        : stringifyValue(field.id),
  }));
}

function parseValue(value: string): FieldId | null {
  return value === "" ? null : JSON.parse(value);
}

function stringifyValue(value: FieldId | null): string {
  return value === null ? "" : JSON.stringify(value);
}

function getFkFieldPlaceholder(field: Field, idFields: Field[]) {
  const hasIdFields = idFields?.length > 0;
  const isRestrictedFKTargetSelected =
    field.isFK() &&
    field.fk_target_field_id != null &&
    !idFields?.some(idField => idField.id === field.fk_target_field_id);

  if (isRestrictedFKTargetSelected) {
    return t`Field access denied`;
  }

  return hasIdFields ? t`Select a target` : t`No key available`;
}

function hasMultipleSchemas(field: Field[]) {
  const schemas = new Set(field.map(field => field.table?.schema));
  return schemas.size > 1;
}
