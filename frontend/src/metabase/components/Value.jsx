/* @flow */

import React from "react";

import { formatValue } from "metabase/lib/formatting";

import type { Value as ValueType } from "metabase/meta/types/Dataset";
import type { FormattingOptions } from "metabase/lib/formatting"

type Props = {
    value: ValueType
} & FormattingOptions;

const Value = ({ value, ...options }: Props) => {
    let formatted = formatValue(value, { ...options, jsx: true });
    if (React.isValidElement(formatted)) {
        return formatted;
    } else {
        return <span>{formatted}</span>
    }
}

export default Value;
