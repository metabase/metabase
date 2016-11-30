import React from "react";

import Input from "metabase/components/Input.jsx";

const NumericInput = ({ value, onChange, ...props }) =>
    <Input
        value={value == null ? "" : String(value)}
        onBlurChange={({ target: { value }}) => {
            value = value ? parseInt(value, 10) : null;
            if (!isNaN(value)) {
                onChange(value);
            }
        }}
        {...props}
    />

export default NumericInput;
