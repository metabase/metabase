import { useMemo, useState } from "react";
import { t } from "ttag";

import { coercions_for_type } from "cljs/metabase.types";
import { Select, type SelectProps } from "metabase/ui";
import type { Field } from "metabase-types/api";

import S from "./CoercionStrategyPicker.module.css";

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
  const [isTouched, setIsTouched] = useState(false);
  const data = useMemo(() => coercions_for_type(baseType), [baseType]);
  const error =
    value == null ? t`To enable casting, please select a data type` : null;

  return (
    <Select
      classNames={{
        root: S.root,
      }}
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
      error={isTouched ? error : null}
      placeholder={t`Select data type`}
      value={value}
      onBlur={() => setIsTouched(true)}
      onChange={onChange}
      {...props}
    />
  );
};
