import { Input, type InputProps } from "@mantine/core";
import cx from "classnames";
import { forwardRef, type InputHTMLAttributes, type Ref } from "react";

import { Icon } from "../../../icons";

import S from "./CustomSelect.module.css";

export type CustomSelectProps = InputHTMLAttributes<HTMLInputElement> &
  InputProps & { clearable?: boolean; onClear?: () => void };

export const CustomSelect = forwardRef(function CustomSelect(
  {
    value,
    classNames,
    readOnly,
    disabled,
    clearable,
    onClear,
    ...props
  }: CustomSelectProps,
  ref: Ref<HTMLInputElement>,
) {
  const canClear = value != null && clearable;
  const hasRightSection = !readOnly && !(disabled && canClear);

  return (
    <Input
      ref={ref}
      classNames={{
        ...classNames,
        input: cx(S.input, classNames?.input),
        rightSection: cx(
          { [S.rightSection]: canClear },
          classNames?.rightSection,
        ),
      }}
      {...props}
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
    />
  );
});
