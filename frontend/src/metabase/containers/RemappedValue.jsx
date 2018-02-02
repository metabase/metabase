import React from "react";

import { formatValue } from "metabase/lib/formatting";

import Remapped from "metabase/hoc/Remapped";

const RemappedValue = Remapped(({
    value,
    column,
    displayValue,
    displayColumn,
    renderNormal = defaultRenderNormal,
    renderRemapped = defaultRenderRemapped,
    ...props,
}) => {
    if (column != null) {
      value = formatValue(value, {
          ...props,
          column: column,
          jsx: true,
          remap: false
      })
    }
    if (displayColumn != null) {
      displayValue = formatValue(displayValue, {
          ...props,
          column: displayColumn,
          jsx: true,
          remap: false
      });
    }
    if (displayValue != null) {
      return renderRemapped({ value, displayValue, column, displayColumn });
    } else {
      return renderNormal({ value, column });
    }
});

const defaultRenderNormal = ({ value, column }) => (
    <span className="text-bold">{value}</span>
);

const defaultRenderRemapped = ({ value, displayValue, column, displayColumn }) => (
    <span>
        <span className="text-bold">{displayValue}</span>
        {/* Show the underlying ID for PK/FK */}
        { column.isID() &&
            <span style={{ opacity: 0.5 }}>{" - " + value}</span>
        }
    </span>
);

export default RemappedValue;
