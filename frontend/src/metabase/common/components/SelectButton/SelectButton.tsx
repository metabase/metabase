import cx from "classnames";
import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";
import * as React from "react";

import { Icon, InputBase } from "metabase/ui";

import S from "./SelectButton.module.css";

/* Room for the clear icon and the chevron side by side:
   8px padding + 12px icon + 4px gap + 12px icon + 8px padding. */
const CLEAR_SECTION_WIDTH = "2.75rem";

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
    root?: string;
    icon?: string;
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
      if (onClear) {
        // Required not to trigger the usual SelectButton's onClick handler
        event.stopPropagation();
        onClear();
      }
    },
    [onClear],
  );

  const showClear = hasValue && !!onClear;

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
      rightSection={
        <>
          {showClear && (
            <Icon
              className={cx(S.clear, classNames.icon)}
              name="close"
              onClick={handleClear}
            />
          )}
          <Icon className={classNames.icon} name="chevrondown" />
        </>
      }
      rightSectionPointerEvents="none"
      rightSectionWidth={showClear ? CLEAR_SECTION_WIDTH : undefined}
      classNames={{
        root: cx(S.root, { [S.fullWidth]: fullWidth }),
        wrapper: S.wrapper,
        section: S.section,
        input: cx(
          S.input,
          { [S.noValue]: !hasValue },
          classNames.root,
          className,
        ),
      }}
      styles={{ input: style }}
      {...rest}
    >
      <span className={S.content} data-testid="select-button-content">
        {children}
      </span>
    </InputBase>
  );
});

export const SelectButton = SelectButtonInner;
