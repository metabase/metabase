import { Input, type InputProps } from "@mantine/core";
import { forwardRef, type InputHTMLAttributes, type Ref } from "react";

import { Icon } from "../../icons";

import S from "./SelectInput.module.css";

export type SelectInputProps = InputHTMLAttributes<HTMLInputElement> &
  InputProps & { clearable?: boolean; onClear?: () => void };

export const SelectInput = forwardRef(function SelectInput(
  { value, readOnly, disabled, clearable, onClear, ...props }: SelectInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const canClear = value != null && clearable;
  const hasRightSection = !readOnly && !(disabled && canClear);

  return (
    <Input
      ref={ref}
      classNames={{
        input: S.input,
        rightSection: canClear ? undefined : S.rightSection,
      }}
      value={value}
      disabled={disabled}
      readOnly
      rightSection={
        hasRightSection && (
          <Icon
            className={S.icon}
            name={canClear ? "close" : "chevrondown"}
            onClick={canClear ? onClear : undefined}
          />
        )
      }
      {...props}
    />
  );
});
