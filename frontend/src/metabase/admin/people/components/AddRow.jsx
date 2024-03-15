import cx from "classnames";
import PropTypes from "prop-types";
import { forwardRef } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import InputS from "metabase/css/core/inputs.module.css";

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
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className="my2 pl1 p1 bordered border-brand rounded relative flex align-center"
    >
      {children}
      <input
        className={cx(InputS.InputBorderless, "h3 ml1 flex-full")}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus
        onKeyDown={onKeyDown}
        onChange={onChange}
      />
      <span className="link no-decoration cursor-pointer" onClick={onCancel}>
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

AddRow.propTypes = {
  value: PropTypes.string.isRequired,
  isValid: PropTypes.bool.isRequired,
  placeholder: PropTypes.string,
  onKeyDown: PropTypes.func,
  onChange: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  children: PropTypes.node,
};
