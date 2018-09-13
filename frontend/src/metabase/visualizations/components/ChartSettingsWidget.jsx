import React from "react";

import cx from "classnames";

const ChartSettingsWidget = ({
  title,
  hidden,
  disabled,
  widget,
  value,
  onChange,
  props,
  // NOTE: special props to support adding additional fields
  question,
  addField,
}) => {
  const W = widget;
  return (
    <div className={cx("mb2", { hide: hidden, disable: disabled })}>
      {title && <h4 className="mb1">{title}</h4>}
      {W && (
        <W
          value={value}
          onChange={onChange}
          question={question}
          addField={addField}
          {...props}
        />
      )}
    </div>
  );
};

export default ChartSettingsWidget;
