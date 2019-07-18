/* @flow */

import React from "react";
import { t } from "ttag";

import NumberPicker from "./NumberPicker";
import SelectPicker from "./SelectPicker";
import TextPicker from "./TextPicker";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";

import { getFilterArgumentFormatOptions } from "metabase/lib/schema_metadata";

export default function DefaultPicker({
  filter,
  setValue,
  setValues,
  onCommit,
  className,
  width = 440,
}) {
  const operator = filter.operator();
  const field = filter.dimension().field();
  const fieldWidgets =
    operator &&
    operator.fields.map((operatorField, index) => {
      if (!operator) {
        return null;
      }
      let values, onValuesChange;
      const placeholder =
        (operator && operator.placeholders && operator.placeholders[index]) ||
        undefined;
      if (operator.multi) {
        values = filter.arguments();
        onValuesChange = values => setValues(values);
      } else {
        // $FlowFixMe
        values = [filter.arguments()[index]];
        onValuesChange = values => setValue(index, values[0]);
      }
      if (operatorField.type === "hidden") {
        return null;
      } else if (operatorField.type === "select") {
        return (
          <SelectPicker
            key={index}
            options={operatorField.values}
            // $FlowFixMe
            values={(values: Array<string>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (field && field.id != null) {
        return (
          <FieldValuesWidget
            value={(values: Array<string>)}
            onChange={onValuesChange}
            multi={operator.multi}
            placeholder={placeholder}
            field={field}
            searchField={field.filterSearchField()}
            autoFocus={index === 0}
            alwaysShowOptions={operator.fields.length === 1}
            formatOptions={getFilterArgumentFormatOptions(operator, index)}
            minWidth={width}
            maxWidth={width}
          />
        );
      } else if (operatorField.type === "text") {
        return (
          <TextPicker
            key={index}
            // $FlowFixMe
            values={(values: Array<string>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (operatorField.type === "number") {
        return (
          <NumberPicker
            key={index}
            // $FlowFixMe
            values={(values: Array<number | null>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      }
      return null;
    });
  if (fieldWidgets && fieldWidgets.filter(f => f).length > 0) {
    return (
      <div className={className}>
        {fieldWidgets.map((fieldWidget, index) => (
          <div
            key={index}
            className={index < fieldWidgets.length - 1 ? "mb1" : null}
          >
            {fieldWidget}
          </div>
        ))}
      </div>
    );
  } else {
    return <div className={className} />;
  }
}
