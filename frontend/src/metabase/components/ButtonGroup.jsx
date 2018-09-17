/* @flow */

import React from "react";

import cx from "classnames";

const ButtonGroup = ({
  value,
  onChange,
  options,
  optionNameFn = o => o.name,
  optionValueFn = o => o.value,
  optionKeyFn = optionValueFn,
  className,
}) => {
  return (
    <div className={cx(className, "rounded bordered flex")}>
      {options.map((o, index) => (
        <div
          key={optionKeyFn(o)}
          className={cx(
            "flex flex-full layout-centered text-bold text-brand-hover p1 cursor-pointer",
            { "border-left": index > 0 },
            optionValueFn(o) === value ? "text-brand" : "text-medium",
          )}
          onClick={() => onChange(optionValueFn(o))}
        >
          {optionNameFn(o)}
        </div>
      ))}
    </div>
  );
};

export default ButtonGroup;
