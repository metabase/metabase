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
  // disable reset button
  noReset,
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
          <Icon
            size={12}
            className={cx("ml1 text-light text-medium-hover cursor-pointer", {
              hidden: !set || noReset,
            })}
            name="refresh"
            tooltip="Reset to default"
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
