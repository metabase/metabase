import React from "react";

import Remapped from "metabase/hoc/Remapped";

const RemappedValue = Remapped(({
    value,
    column,
    displayValue,
    displayColumn
}) => {
    if (displayValue != null) {
        return (
            <span>
                <span className="text-bold">{displayValue}</span>
                <span style={{ opacity: 0.5 }}>{" - " + value}</span>
            </span>
        );
    } else {
        return <span>{value}</span>;
    }
});

export default RemappedValue;
