import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

export const AddRow = ({
  value,
  isValid,
  placeholder,
  onKeyDown,
  onChange,
  onDone,
  onCancel,
  children,
}) => (
  <div className="my2 pl1 p1 bordered border-brand rounded relative flex align-center">
    {children}
    <input
      className="input--borderless h3 ml1 flex-full"
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
      className={cx("Button ml2", { "Button--primary": !!isValid })}
      disabled={!isValid}
      onClick={onDone}
    >
      {t`Add`}
    </button>
  </div>
);

AddRow.propTypes = {
  value: PropTypes.string.isRequired,
  isValid: PropTypes.bool.isRequired,
  placeholder: PropTypes.string,
  onKeyDown: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  children: PropTypes.node,
};
