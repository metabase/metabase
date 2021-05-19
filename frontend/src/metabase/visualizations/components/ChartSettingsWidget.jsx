/* eslint-disable react/prop-types */
import React from "react";

import cx from "classnames";
import Icon from "metabase/components/Icon";

const ChartSettingsWidget = ({
  title,
  description,
  hint,
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
      {title && (
        <h4 className="mb1 flex align-center">
          {title}
          {hint && (
            <span className="flex ml1">
              <Icon name="info" size={14} tooltip={hint} />
            </span>
          )}
        </h4>
      )}
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
