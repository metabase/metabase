import { useMemo, useState } from "react";
import { t } from "ttag";

import { coercions_for_type } from "cljs/metabase.types.core";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Select, type SelectProps } from "metabase/ui";
import type { Field } from "metabase-types/api";

import S from "./CoercionStrategyPicker.module.css";
import { humanizeCoercionStrategy } from "./utils";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  baseType: Field["base_type"];
  value: string | undefined;
  onChange: (value: string) => void;
}

export const CoercionStrategyPicker = ({
  baseType,
  comboboxProps,
  value,
  onChange,
  ...props
}: Props) => {
  const [isTouched, setIsTouched] = useState(false);
  // debounce to prevent error briefly shown when disabling casting
  const isTouchedDebounced = useDebouncedValue(isTouched, 100);
  const data = useMemo(() => {
    return coercions_for_type(baseType).map((coercion: string) => ({
      label: humanizeCoercionStrategy(coercion),
      value: coercion,
    }));
  }, [baseType]);

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
        ...comboboxProps,
      }}
      data={data}
      error={
        isTouchedDebounced && value == null
          ? t`To enable casting, please select a data type`
          : undefined
      }
      placeholder={t`Select data type`}
      value={value}
      onBlur={() => setIsTouched(true)}
      onChange={(value) => onChange(value)}
      {...props}
    />
  );
};
