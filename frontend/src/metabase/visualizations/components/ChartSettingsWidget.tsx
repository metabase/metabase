import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";

type Props = {
  title?: string;
  description?: string;
  hint?: string;
  hidden?: boolean;
  disabled?: boolean;
  widget?: React.ComponentType;
  props?: Record<string, unknown>;
  noPadding?: boolean;
};

const ChartSettingsWidget = ({
  title,
  description,
  hint,
  hidden,
  disabled,
  widget: Widget,
  props,
  // disables X padding for certain widgets so divider line extends to edge
  noPadding,
  // NOTE: pass along special props to support:
  // * adding additional fields
  // * substituting widgets
  ...extraWidgetProps
}: Props) => {
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
      {Widget && <Widget {...extraWidgetProps} {...props} />}
    </div>
  );
};

export default ChartSettingsWidget;
