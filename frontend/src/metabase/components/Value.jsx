import React from "react";

import { formatValue } from "metabase/lib/formatting";

const Value = ({ value, ...options }) => {
    let formatted = formatValue(value, { ...options, jsx: true });
    if (React.isValidElement(formatted)) {
        return formatted;
    } else {
        return <span>{formatted}</span>
    }
}

export default Value;
