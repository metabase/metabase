/* eslint-disable react/prop-types */
import React from "react";

import Button from "metabase/components/Button";

import _ from "underscore";

type Mapping = {
  [key: string]: any,
};

type Style = {
  [key: string]: any,
};

type Props = {
  value: Mapping,
  onChange: (mapping: Mapping) => void,
  className?: string,
  style?: Style,
  keyPlaceholder?: string,
  valuePlaceholder?: string,
  keyHeader?: React.Element<any>,
  valueHeader?: React.Element<any>,
  divider?: React.Element<any>,
  canAdd?: boolean,
  canDelete?: boolean,
  addText?: string,
  swapKeyAndValue?: boolean,
  renderKeyInput?: any, // FIXME
  renderValueInput?: any, // FIXME
};

const DefaultRenderInput = ({ value, onChange, placeholder }) => (
  <input
    className="input"
    value={value}
    placeholder={placeholder}
    onChange={e => onChange(e.target.value)}
  />
);

const MappingEditor = ({
  value,
  onChange,
  className,
  style,
  keyHeader,
  valueHeader,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  renderKeyInput = DefaultRenderInput,
  renderValueInput = DefaultRenderInput,
  divider,
  canAdd = true,
  canDelete = true,
  addText = "Add",
  swapKeyAndValue,
}: Props) => {
  const mapping = value;
  const entries = Object.entries(mapping);
  return (
    <table className={className} style={style}>
      {keyHeader || valueHeader ? (
        <thead>
          <tr>
            <td>{!swapKeyAndValue ? keyHeader : valueHeader}</td>
            <td />
            <td>{!swapKeyAndValue ? valueHeader : keyHeader}</td>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {entries.map(([key, value], index) => {
          const keyInput = renderKeyInput({
            value: key,
            placeholder: keyPlaceholder,
            onChange: newKey =>
              onChange(replaceMappingKey(mapping, key, newKey)),
          });
          const valueInput = renderValueInput({
            value: value,
            placeholder: valuePlaceholder,
            onChange: newValue =>
              onChange(replaceMappingValue(mapping, key, newValue)),
          });
          return (
            <tr key={index}>
              <td className="pb1">
                {!swapKeyAndValue ? keyInput : valueInput}
              </td>
              <td className="pb1 px1">{divider}</td>
              <td className="pb1">
                {!swapKeyAndValue ? valueInput : keyInput}
              </td>
              {canDelete && (
                <td>
                  <Button
                    icon="close"
                    type="button" // prevent submit. should be the default but it's not
                    borderless
                    onClick={() => onChange(removeMapping(mapping, key))}
                  />
                </td>
              )}
            </tr>
          );
        })}
        {!("" in mapping) &&
          _.every(mapping, value => value != null) &&
          canAdd && (
            <tr>
              <td colSpan={2}>
                <Button
                  icon="add"
                  type="button" // prevent submit. should be the default but it's not
                  borderless
                  className="text-brand p0 py1"
                  onClick={() => onChange(addMapping(mapping))}
                >
                  {addText}
                </Button>
              </td>
            </tr>
          )}
      </tbody>
    </table>
  );
};

const addMapping = mappings => {
  return { ...mappings, "": null };
};

const removeMapping = (mappings, prevKey) => {
  mappings = { ...mappings };
  delete mappings[prevKey];
  return mappings;
};

const replaceMappingValue = (mappings, oldKey, newValue) => {
  return { ...mappings, [oldKey]: newValue };
};

const replaceMappingKey = (mappings, oldKey, newKey) => {
  const newMappings = {};
  for (const key in mappings) {
    newMappings[key === oldKey ? newKey : key] = mappings[key];
  }
  return newMappings;
};

export default MappingEditor;
