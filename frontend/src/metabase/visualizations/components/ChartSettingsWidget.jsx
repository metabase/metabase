import React from "react";

import cx from "classnames";

const ChartSettingsWidget = ({
  title,
  description,
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
        mb3: !hidden,
        mx4: !noPadding,
        hide: hidden,
        disable: disabled,
      })}
    >
      {title && <h4 className="mb1 flex align-center">{title}</h4>}
      {description && <div className="mb1">{description}</div>}
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
