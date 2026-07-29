import { t } from "ttag";

import { FIELD_VISIBILITY_TYPES } from "metabase/common/utils/fields";
import {
  Select,
  SelectItemWithDescription,
  type SelectProps,
} from "metabase/ui";
import type { FieldVisibilityType } from "metabase-types/api";

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
        const option = DATA.find(
          (option) => option.value === item.option.value,
        );

        return (
          <SelectItemWithDescription
            selected={item.option.value === value}
            label={item.option.label}
            description={option?.description}
          />
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
