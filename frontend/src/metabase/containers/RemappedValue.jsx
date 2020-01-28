import React from "react";

import { formatValue } from "metabase/lib/formatting";

import AutoLoadRemapped from "metabase/hoc/Remapped";

const defaultRenderNormal = ({ value, column }) => (
  <span className="text-bold">{value}</span>
);

const defaultRenderRemapped = ({
  value,
  displayValue,
  column,
  displayColumn,
}) => (
  <span>
    <span className="text-bold">{displayValue}</span>
    {/* Show the underlying ID for PK/FK */}
    {column.isID() && <span style={{ opacity: 0.5 }}>{" - " + value}</span>}
  </span>
);

const RemappedValueContent = ({
  value,
  column,
  displayValue,
  displayColumn,
  renderNormal = defaultRenderNormal,
  renderRemapped = defaultRenderRemapped,
  ...props
}) => {
  if (column != null) {
    value = formatValue(value, {
      ...props,
      column: column,
      jsx: true,
      remap: false,
    });
  }
  if (displayColumn != null) {
    displayValue = formatValue(displayValue, {
      ...props,
      column: displayColumn,
      jsx: true,
      remap: false,
    });
  }
  if (displayValue != null) {
    return renderRemapped({ value, displayValue, column, displayColumn });
  } else {
    return renderNormal({ value, column });
  }
};

export const AutoLoadRemappedValue = AutoLoadRemapped(RemappedValueContent);

export const FieldRemappedValue = props => (
  <RemappedValueContent
    {...props}
    displayValue={props.column.remappedValue(props.value)}
    displayColumn={props.column.remappedField()}
  />
);

const RemappedValue = ({ autoLoad = true, ...props }) =>
  autoLoad ? (
    <AutoLoadRemappedValue {...props} />
  ) : (
    <FieldRemappedValue {...props} />
  );

export default RemappedValue;

// test version doesn't use metabase/hoc/Remapped which requires a redux store
export const TestRemappedValue = RemappedValueContent;
