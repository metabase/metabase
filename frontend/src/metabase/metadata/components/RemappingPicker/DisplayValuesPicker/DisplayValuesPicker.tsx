import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";

import type { RemappingValue } from "./types";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  options: RemappingValue[];
  value: RemappingValue;
  onChange: (value: RemappingValue) => void;
}

export const DisplayValuesPicker = ({
  comboboxProps,
  options,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData(options, value), [options, value]);

  const handleChange = (value: string) => {
    const newValue = value as RemappingValue;
    onChange(newValue);
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
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData(options: RemappingValue[], value: RemappingValue) {
  const allOptions = [...options, value];

  return [
    {
      disabled: !allOptions.includes("original"),
      label: t`Use original value`,
      value: "original",
    },
    {
      disabled: !allOptions.includes("foreign"),
      label: t`Use foreign key`,
      value: "foreign",
    },
    {
      disabled: !allOptions.includes("custom"),
      label: t`Custom mapping`,
      value: "custom",
    },
  ];
}
