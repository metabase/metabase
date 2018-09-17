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
  // NOTE: special props to support adding additional fields
  question,
  addField,
}) => (
  <div
    className={cx({
      mb2: !hidden,
      hide: hidden,
      disable: disabled,
      mx4: !noPadding,
    })}
  >
    {title && <h4 className="mb1">{title}</h4>}
    {Widget && (
      <Widget
        value={value}
        onChange={onChange}
        question={question}
        addField={addField}
        {...props}
      />
    )}
  </div>
);

export default ChartSettingsWidget;
