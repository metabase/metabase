import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: boolean;
  onChange: (value: boolean) => void;
}

export const UnfoldJsonPicker = ({
  comboboxProps,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData(), []);

  const handleChange = (value: string) => {
    onChange(value === "true" ? true : false);
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
      placeholder={t`Select whether to unfold JSON`}
      value={String(value)}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData() {
  return [
    { label: t`Yes`, value: "true" },
    { label: t`No`, value: "false" },
  ];
}
