import { useMemo } from "react";
import { t } from "ttag";

import { coercions_for_type } from "cljs/metabase.types";
import { Select, type SelectProps } from "metabase/ui";
import type { Field } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  baseType: Field["base_type"];
  value: string | undefined;
  onChange: (value: string) => void;
}

export const CoercionStrategyPicker = ({
  baseType,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => coercions_for_type(baseType), [baseType]);

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
      }}
      data={data}
      placeholder={t`Select data type`}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};
