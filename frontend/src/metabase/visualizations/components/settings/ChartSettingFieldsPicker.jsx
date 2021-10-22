/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import ChartSettingFieldPicker from "./ChartSettingFieldPicker";

const ChartSettingFieldsPicker = ({
  value = [],
  options,
  onChange,
  addAnother,
  ...props
}) => (
  <div>
    {Array.isArray(value) ? (
      value.map((v, index) => (
        <ChartSettingFieldPicker
          {...props}
          className={index > 0 ? "mt1" : null}
          key={index}
          value={v}
          options={options}
          onChange={v => {
            const newValue = [...value];
            // this swaps the position of the existing value
            const existingIndex = value.indexOf(v);
            if (existingIndex >= 0) {
              newValue.splice(existingIndex, 1, value[index]);
            }
            // replace with the new value
            newValue.splice(index, 1, v);
            onChange(newValue);
          }}
          onRemove={
            value.filter(v => v != null).length > 1 ||
            (value.length > 1 && v == null)
              ? () =>
                  onChange([
                    ...value.slice(0, index),
                    ...value.slice(index + 1),
                  ])
              : null
          }
        />
      ))
    ) : (
      <span className="text-error">{t`error`}</span>
    )}
    {addAnother && (
      <div className="mt2 mb3">
        <a
          className="text-brand text-bold py1 px2 rounded bg-light bg-medium-hover"
          onClick={() => {
            const remaining = options.filter(o => value.indexOf(o.value) < 0);
            if (remaining.length === 1) {
              // if there's only one unused option, use it
              onChange(value.concat([remaining[0].value]));
            } else {
              // otherwise leave it blank
              onChange(value.concat([undefined]));
            }
          }}
        >
          {addAnother}
        </a>
      </div>
    )}
  </div>
);

export default ChartSettingFieldsPicker;
