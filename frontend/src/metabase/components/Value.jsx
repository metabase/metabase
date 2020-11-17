/* @flow */

import React from "react";

import RemappedValue from "metabase/containers/RemappedValue";

import { formatValue } from "metabase/lib/formatting";

import type { Value as ValueType } from "metabase-types/types/Dataset";
import type { FormattingOptions } from "metabase/lib/formatting";

type Props = {
  value: ValueType,
} & FormattingOptions;

const Value = ({ value, ...options }: Props) => {
  if (options.hide) {
    return null;
  }
  if (options.remap) {
    return <RemappedValue value={value} {...options} />;
  }
  const formatted = formatValue(value, { ...options, jsx: true });
  if (React.isValidElement(formatted)) {
    return formatted;
  } else {
    return <span>{formatted}</span>;
  }
};

export default Value;
