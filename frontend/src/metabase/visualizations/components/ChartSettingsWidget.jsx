import React from "react";

import Icon from "metabase/components/Icon";

import cx from "classnames";

const ChartSettingsWidget = ({
  title,
  hidden,
  disabled,
  set,
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
      {title && (
        <h4 className="mb1 flex align-center">
          {title}
          <Icon
            size={12}
            className={cx("ml1 text-light text-medium-hover cursor-pointer", {
              hidden: !set,
            })}
            name="close"
            onClick={() => onChange(undefined)}
          />
        </h4>
      )}

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
