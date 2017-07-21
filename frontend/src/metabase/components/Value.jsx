/* @flow */

import React from "react";

import RemappedValue from "metabase/containers/RemappedValue";

import { formatValue } from "metabase/lib/formatting";

import { getIn } from "icepick";

import type { Value as ValueType } from "metabase/meta/types/Dataset";
import type { FormattingOptions } from "metabase/lib/formatting"

type Props = {
    value: ValueType
} & FormattingOptions;

const Value = ({ value, ...options }: Props) => {
    if (getIn(options, ["column", "dimensions", "human_readable_field_id"]) != null) {
        return <RemappedValue value={value} {...options} />
    }
    let formatted = formatValue(value, { ...options, jsx: true });
    if (React.isValidElement(formatted)) {
        return formatted;
    } else {
        return <span>{formatted}</span>
    }
}

export default Value;
