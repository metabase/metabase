import { t } from "ttag";

import { FIELD_VISIBILITY_TYPES } from "metabase/lib/core";
import {
  Flex,
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  Text,
} from "metabase/ui";
import type { FieldVisibilityType } from "metabase-types/api";

import S from "./FieldVisibilityPicker.module.css";

const DATA = getData();

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: FieldVisibilityType;
  onChange: (value: FieldVisibilityType) => void;
}

export const FieldVisibilityPicker = ({
  comboboxProps,
  value,
  onChange,
  ...props
}: Props) => {
  const handleChange = (value: string) => {
    if (!isFieldVisibilityType(value)) {
      throw new Error("Unknown FieldVisibilityType. This should never happen");
    }

    onChange(value);
  };

  return (
    <Select
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
      data={DATA}
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
      {...props}
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
