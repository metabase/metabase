import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon";
import cx from "classnames";

import ChartSettingSelect from "./ChartSettingSelect.jsx";

const ChartSettingFieldPicker = ({ value = [], onChange, options, addAnother }) =>
    <div>
        { value.map((v, index) =>
            <div key={index} className="flex align-center">
                <ChartSettingSelect
                    value={v}
                    options={options}
                    onChange={(v) => {
                        let newValue = [...value];
                        // this swaps the position of the existing value
                        let existingIndex = value.indexOf(v);
                        if (existingIndex >= 0) {
                            newValue.splice(existingIndex, 1, value[index]);
                        }
                        // replace with the new value
                        newValue.splice(index, 1, v);
                        onChange(newValue);
                    }}
                    isInitiallyOpen={v === undefined}
                />
                <Icon
                    name="close"
                    className={cx("ml1 text-grey-4 text-brand-hover cursor-pointer", {
                        "disabled hidden": value.filter(v => v != null).length < 2
                    })}
                    width={12} height={12}
                    onClick={() => onChange([...value.slice(0, index), ...value.slice(index + 1)])}
                />
            </div>
        )}
        { addAnother &&
            <div className="mt1">
                <a onClick={() => {
                    const remaining = options.filter(o => value.indexOf(o.value) < 0);
                    if (remaining.length === 1) {
                        // if there's only one unused option, use it
                        onChange(value.concat([remaining[0].value]));
                    } else {
                        // otherwise leave it blank
                        onChange(value.concat([undefined]));
                    }
                }}>
                    {addAnother}
                </a>
            </div>
        }
    </div>

export default ChartSettingFieldPicker;
