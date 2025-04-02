import { t } from "ttag";

import { FIELD_VISIBILITY_TYPES } from "metabase/lib/core";
import { Flex, Icon, Select, SelectItem, Text } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldVisibilityType } from "metabase-types/api";

import S from "./FieldVisibilityPicker.module.css";

const DATA = getData();

interface FieldVisibilityPickerProps {
  className?: string;
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

export const FieldVisibilityPicker = ({
  className,
  field,
  onUpdateField,
}: FieldVisibilityPickerProps) => {
  const value = field.visibility_type;

  const handleChange = (visibilityType: string) => {
    if (!isFieldVisibilityType(visibilityType)) {
      throw new Error("Unknown 'visibilityType'. This should never happen");
    }

    onUpdateField(field, {
      visibility_type: visibilityType,
    });
  };

  return (
    <Select
      className={className}
      comboboxProps={{
        position: "bottom-start",
        width: 300,
      }}
      data={DATA}
      fw="bold"
      placeholder={t`Select a field visibility`}
      renderOption={(item) => {
        const selected = item.option.value === value;
        const option = DATA.find(
          (option) => option.value === item.option.value,
        );

        return (
          <SelectItem selected={selected}>
            <Icon name={selected ? "check" : "empty"} />

            <Flex direction="column" flex="1" gap="xs">
              <Text c="inherit" fw="bold" lh="1rem">
                {item.option.label}
              </Text>

              {option?.description && (
                <Text c="text-tertiary" className={S.description} lh="1rem">
                  {option.description}
                </Text>
              )}
            </Flex>
          </SelectItem>
        );
      }}
      value={value}
      onChange={handleChange}
    />
  );
};

function getData() {
  return FIELD_VISIBILITY_TYPES.map((type) => ({
    description: type.description,
    label: type.name,
    value: type.id,
  }));
}

function isFieldVisibilityType(value: string): value is FieldVisibilityType {
  /**
   * Using a Record, so that this gives compilation error when FieldVisibilityType is extended,
   * so that whoever changes that type does not forget to update this type guard.
   */
  const visibilityTypesMap: Record<FieldVisibilityType, boolean> = {
    "details-only": true,
    hidden: true,
    normal: true,
    retired: true,
    sensitive: true,
  };

  return Object.keys(visibilityTypesMap).includes(value);
}
