/* eslint-disable react/prop-types */
import { isValidElement } from "react";

import { formatValue } from "metabase/lib/formatting";

import RemappedValue from "./RemappedValue";

const Value = ({ value, ...options }) => {
  if (options.hide) {
    return null;
  }
  if (options.remap) {
    return <RemappedValue value={value} {...options} />;
  }
  const formatted = formatValue(value, { ...options, jsx: true });
  if (isValidElement(formatted)) {
    return formatted;
  } else {
    return <span>{formatted}</span>;
  }
};

export default Value;
