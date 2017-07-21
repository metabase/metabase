import React from "react";

import { formatValue } from "metabase/lib/formatting";

import Remapped from "metabase/hoc/Remapped";

const RemappedValue = Remapped(({
    value,
    column,
    displayValue,
    displayColumn,
    renderRemapped = defaultRenderRemapped
}) => {
    if (displayColumn) {
        return renderRemapped({
            value: formatValue(value, {
                column: column,
                jsx: true,
                remap: false
            }),
            displayValue: formatValue(displayValue, {
                column: displayColumn,
                jsx: true,
                remap: false
            })
        });
    } else {
        return (
            <span>
                {formatValue(value, {
                    column: column,
                    jsx: true,
                    remap: false
                })}
            </span>
        );
    }
});

const defaultRenderRemapped = ({ value, displayValue }) => (
    <span>
        <span className="text-bold">{displayValue}</span>
        <span style={{ opacity: 0.5 }}>{" - " + value}</span>
    </span>
);

export default RemappedValue;
