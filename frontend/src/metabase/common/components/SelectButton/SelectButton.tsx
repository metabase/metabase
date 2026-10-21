import cx from "classnames";
import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";
import * as React from "react";
import { t } from "ttag";

import { Icon, Input, InputBase } from "metabase/ui";

import S from "./SelectButton.module.css";

export interface SelectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hasValue?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  onClear?: () => void;
  dataTestId?: string;
  classNames?: {
    input?: string;
    section?: string;
  };
}

const SelectButtonInner = forwardRef(function SelectButton(
  {
    className,
    style,
    children,
    hasValue = true,
    disabled = false,
    fullWidth = true,
    onClick,
    onClear,
    dataTestId,
    classNames = {},
    ...rest
  }: SelectButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      // Required not to trigger the usual SelectButton's onClick handler
      event.stopPropagation();
      onClear?.();
    },
    [onClear],
  );

  const showClear = hasValue && onClear !== undefined && !disabled;

  return (
    <InputBase
      component="button"
      type="button"
      size="md"
      pointer
      data-testid={`${dataTestId ? `${dataTestId}-` : ""}select-button`}
      ref={ref}
      disabled={disabled}
      onClick={onClick}
      className={cx(S.root, { [S.fullWidth]: fullWidth }, className)}
      style={style}
      rightSection={
        showClear ? (
          <Input.ClearButton
            aria-label={t`Clear`}
            className={S.clear}
            onClick={handleClear}
          />
        ) : (
          <Icon name="chevrondown" />
        )
      }
      rightSectionPointerEvents="none"
      classNames={{
        wrapper: S.wrapper,
        section: cx(S.section, classNames.section),
        input: cx(S.input, { [S.noValue]: !hasValue }, classNames.input),
      }}
      {...rest}
    >
      <span className={S.content} data-testid="select-button-content">
        {children}
      </span>
    </InputBase>
  );
});

export const SelectButton = SelectButtonInner;
