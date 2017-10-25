import React from "react";

import Input from "metabase/components/Input.jsx";

// value is an array of strings. This component provides one input box per string
export default function ChartSettingInputGroup({ value, onChange }) {
    const inputs = value.map((str, i) => (
        <Input
            key={i}
            className="input block full"
            value={str}
            onBlurChange={(e) => {
                const newStr = e.target.value.trim();
                if (!newStr || !newStr.length) return;

                const newValue = value.slice(); // clone the original `value` array
                newValue[i] = newStr;
                onChange(newValue);
            }}
        />
    ));

    return (
        <div>
            {inputs}
        </div>
    );
}
