import { useMemo } from "react";
import { t } from "ttag";

import { HAS_FIELD_VALUES_OPTIONS } from "metabase/lib/core";
import { Select, type SelectProps } from "metabase/ui";
import type { FieldValuesType } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: FieldValuesType;
  onChange: (value: FieldValuesType) => void;
}

export const FieldValuesTypePicker = ({
  comboboxProps,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData(), []);

  const handleChange = (value: string) => {
    if (!isFieldValuesType(value)) {
      throw new Error("Unknown FieldValuesType. This should never happen");
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
      data={data}
      placeholder={t`Select field filtering`}
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData() {
  return HAS_FIELD_VALUES_OPTIONS.map((type) => ({
    label: type.name,
    value: type.value,
  }));
}

function isFieldValuesType(value: string): value is FieldValuesType {
  /**
   * Using a Record, so that this gives compilation error when FieldValuesType is extended,
   * so that whoever changes that type does not forget to update this type guard.
   */
  const fieldValuesTypesMap: Record<FieldValuesType, boolean> = {
    list: true,
    search: true,
    none: true,
  };

  return Object.keys(fieldValuesTypesMap).includes(value);
}
