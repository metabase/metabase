import React from "react";

import cx from "classnames";

const ChartSettingsWidget = ({
  title,
  hidden,
  disabled,
  widget: Widget,
  value,
  onChange,
  props,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...additionalProps
}) => {
  return (
    <div
      className={cx({
        mb2: !hidden,
        mx4: !noPadding,
        hide: hidden,
        disable: disabled,
      })}
    >
      {title && <h4 className="mb1">{title}</h4>}
      {Widget && (
        <Widget
          value={value}
          onChange={onChange}
          {...additionalProps}
          {...props}
        />
      )}
    </div>
  );
};

export default ChartSettingsWidget;
