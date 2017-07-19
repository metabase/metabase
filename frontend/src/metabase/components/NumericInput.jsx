/* @flow */

import React from "react";

import Input from "metabase/components/Input.jsx";

type Props = {
    value: ?(number|string);
    onChange: (value: ?number) => void
}

const NumericInput = ({ value, onChange, ...props }: Props) =>
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
