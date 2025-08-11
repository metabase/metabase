import { type FocusEvent, useMemo } from "react";
import { t } from "ttag";

import {
  areFieldsComparable,
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import {
  Flex,
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  Text,
} from "metabase/ui";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field as ApiField, Field, FieldId } from "metabase-types/api";

import S from "./FkTargetPicker.module.css";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  field: ApiField;
  idFields: Field[];
  value: FieldId | null;
  onChange: (value: FieldId | null) => void;
}

export const FkTargetPicker = ({
  comboboxProps,
  field,
  idFields,
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  const { comparableIdFields, hasIdFields, data, optionsByFieldId } =
    useMemo(() => {
      const comparableIdFields = idFields.filter((idField) => {
        return areFieldsComparable(idField, field);
      });
      const hasIdFields = comparableIdFields.length > 0;
      const includeSchema = hasMultipleSchemas(comparableIdFields);
      const data = getData(comparableIdFields, includeSchema);
      const optionsByFieldId = Object.fromEntries(
        data.map((option) => [option.value, option]),
      );

      return { comparableIdFields, data, hasIdFields, optionsByFieldId };
    }, [field, idFields]);

  const getFieldFromValue = (fieldId: string | null) => {
    if (fieldId == null) {
      return null;
    }

    const option = optionsByFieldId[fieldId];
    return option?.field;
  };

  const getFieldIdFromValue = (fieldId: string | null): FieldId => {
    const field = getFieldFromValue(fieldId);

    if (!field) {
      throw new Error("unreachable");
    }

    return getRawTableFieldId(field);
  };

  const handleChange = (value: string | null) => {
    if (value != null) {
      const fieldId = getFieldIdFromValue(value);
      onChange(fieldId);
    }
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
    onFocus?.(event);
  };

  return (
    <Select
      aria-label={t`Foreign key target`}
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={data}
      disabled={!hasIdFields}
      filter={({ options, search }) => {
        const query = search.toLowerCase().trim();

        return options.filter((option) => {
          if ("group" in option) {
            return false;
          }

          const field = getFieldFromValue(option.value);

          if (!field) {
            return false;
          }

          return (
            option.label.toLowerCase().includes(query) ||
            field.description?.toLowerCase().includes(query)
          );
        });
      }}
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={getFkFieldPlaceholder(field, comparableIdFields)}
      renderOption={(item) => {
        const field = getFieldFromValue(item.option.value);
        const selected = getFieldIdFromValue(item.option.value) === value;

        return (
          <SelectItem selected={selected}>
            <Icon name={selected ? "check" : "empty"} />

            <Flex direction="column" flex="1" gap="xs">
              <Text c="inherit" component="span" lh="1rem">
                {item.option.label}
              </Text>

              {field?.description && (
                <Text
                  c="text-tertiary"
                  className={S.description}
                  component="span"
                  lh="1rem"
                >
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
      onFocus={handleFocus}
      {...props}
    />
  );
};

function getData(comparableIdFields: Field[], includeSchema: boolean) {
  return comparableIdFields
    .map((field) => {
      return {
        field,
        label: getFieldDisplayName(
          field,
          field.table,
          includeSchema && field.table ? field.table.schema : undefined,
        ),
        value: stringifyValue(getRawTableFieldId(field)) ?? "",
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function stringifyValue(value: FieldId | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function getFkFieldPlaceholder(field: ApiField, idFields: Field[]) {
  const hasIdFields = idFields?.length > 0;
  const isRestrictedFKTargetSelected =
    isFK(field) &&
    field.fk_target_field_id != null &&
    !idFields?.some((idField) => idField.id === field.fk_target_field_id);

  if (isRestrictedFKTargetSelected) {
    return t`Field access denied`;
  }

  return hasIdFields ? t`Select a target` : t`No key available`;
}

function hasMultipleSchemas(fields: Field[]) {
  const schemas = new Set(fields.map((field) => field.table?.schema));
  return schemas.size > 1;
}
