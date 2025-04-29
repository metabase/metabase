import cx from "classnames";
import { type ChangeEvent, type Ref, forwardRef } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

interface AddRowProps {
  value: string;
  isValid: boolean;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDone: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const AddRow = forwardRef(function AddRow(
  {
    value,
    isValid,
    placeholder,
    onKeyDown,
    onChange,
    onDone,
    onCancel,
    children,
  }: AddRowProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cx(
        CS.my2,
        CS.pl1,
        CS.p1,
        CS.bordered,
        CS.borderBrand,
        CS.rounded,
        CS.relative,
        CS.flex,
        CS.alignCenter,
      )}
    >
      {children}
      <input
        className={cx(CS.inputBorderless, CS.h3, CS.ml1, CS.flexFull)}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus
        onKeyDown={onKeyDown}
        onChange={onChange}
      />
      <span className={CS.link} onClick={onCancel}>
        {t`Cancel`}
      </span>
      <button
        className={cx(ButtonsS.Button, CS.ml2, {
          [ButtonsS.ButtonPrimary]: !!isValid,
        })}
        disabled={!isValid}
        onClick={onDone}
      >
        {t`Add`}
      </button>
    </div>
  );
});
