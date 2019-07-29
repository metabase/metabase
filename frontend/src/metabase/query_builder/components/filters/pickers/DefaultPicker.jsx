/* @flow */

import React from "react";

import NumberPicker from "./NumberPicker";
import SelectPicker from "./SelectPicker";
import TextPicker from "./TextPicker";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";

import { getFilterArgumentFormatOptions } from "metabase/lib/schema_metadata";

import type Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  filter: Filter,
  setValue: (index: number, value: any) => void,
  setValues: (value: any[]) => void,
  onCommit: () => void,
  className?: string,
  isSidebar?: boolean,
  minWidth?: number,
  maxWidth?: number,
};

export default function DefaultPicker({
  filter,
  setValue,
  setValues,
  onCommit,
  className,
  isSidebar,
  minWidth,
  maxWidth,
}: Props) {
  const operator = filter.operator();
  if (!operator) {
    return <div className={className} />;
  }

  const dimension = filter.dimension();
  const field = dimension && dimension.field();
  const operatorFields = operator.fields || [];
  const fieldWidgets = operatorFields
    .map((operatorField, index) => {
      let values, onValuesChange;
      const placeholder =
        (operator.placeholders && operator.placeholders[index]) || undefined;
      if (operator.multi) {
        values = filter.arguments();
        onValuesChange = values => setValues(values);
      } else {
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
            values={(values: Array<string>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (field && field.id != null) {
        // get the underling field if the query is nested
        let underlyingField = field;
        let sourceField;
        while ((sourceField = underlyingField.sourceField())) {
          underlyingField = sourceField;
        }
        return (
          <FieldValuesWidget
            className="input"
            value={(values: Array<string>)}
            onChange={onValuesChange}
            multi={operator.multi}
            placeholder={placeholder}
            field={underlyingField}
            searchField={underlyingField.filterSearchField()}
            autoFocus={index === 0}
            alwaysShowOptions={operator.fields.length === 1}
            formatOptions={getFilterArgumentFormatOptions(operator, index)}
            minWidth={minWidth}
            maxWidth={maxWidth}
            optionsMaxHeight={isSidebar ? null : undefined}
          />
        );
      } else if (operatorField.type === "text") {
        return (
          <TextPicker
            key={index}
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
            values={(values: Array<number | null>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      }
      return null;
    })
    .filter(f => f);
  if (fieldWidgets.length > 0) {
    const Layout = DefaultLayout;
    // TODO: custom layouts for different operators
    return <Layout className={className} fieldWidgets={fieldWidgets} />;
  } else {
    return <div className={className} />;
  }
}

const DefaultLayout = ({ className, fieldWidgets }) => (
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
