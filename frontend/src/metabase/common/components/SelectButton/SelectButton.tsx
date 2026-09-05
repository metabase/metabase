import cx from "classnames";
import type { ButtonHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";
import * as React from "react";

import { Icon } from "metabase/ui";

import S from "./SelectButton.module.css";

export interface SelectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  left?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hasValue?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  highlighted?: boolean;
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
    left,
    hasValue = true,
    disabled = false,
    fullWidth = true,
    highlighted = false,
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

  const iconClassName = cx(
    S.icon,
    {
      [S.iconHighlighted]: hasValue && highlighted,
      [S.iconDisabled]: disabled,
    },
    classNames.icon,
  );

  return (
    <button
      type="button"
      data-testid={`${dataTestId ? `${dataTestId}-` : ""}select-button`}
      ref={ref}
      className={cx(
        S.root,
        {
          [S.fullWidth]: fullWidth,
          [S.noValue]: !hasValue,
          [S.highlighted]: hasValue && highlighted,
        },
        classNames.root,
        className,
      )}
      style={style}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {React.isValidElement(left) && left}
      <span
        className={cx(S.content, { [S.contentClearable]: showClear })}
        data-testid="select-button-content"
      >
        {children}
      </span>
      {showClear && (
        <Icon className={iconClassName} name="close" onClick={handleClear} />
      )}
      <Icon className={iconClassName} name="chevrondown" />
    </button>
  );
});

export const SelectButton = SelectButtonInner;
