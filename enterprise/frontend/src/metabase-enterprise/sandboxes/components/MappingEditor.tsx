import _ from "underscore";
import { t } from "ttag";

import type React from "react";
import { Button, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

type DefaultRenderInputProps = {
  value: MappingValue;
  onChange: (val: string) => void;
  placeholder: string;
};

const DefaultRenderInput = ({
  value,
  onChange,
  placeholder,
}: DefaultRenderInputProps) => (
  <TextInput
    value={value || ""}
    placeholder={placeholder}
    onChange={e => onChange(e.target.value)}
  />
);

type MappingValue = string | null;
type MappingType = Record<string, MappingValue>;

interface MappingEditorProps {
  value: MappingType;
  onChange: (val: MappingType) => void;
  className?: string;
  style?: React.CSSProperties;
  keyHeader?: JSX.Element;
  valueHeader?: JSX.Element;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  renderKeyInput?: (input: DefaultRenderInputProps) => JSX.Element;
  renderValueInput?: (input: DefaultRenderInputProps) => JSX.Element;
  divider?: JSX.Element;
  canAdd?: boolean;
  canDelete?: boolean;
  addText?: string;
  swapKeyAndValue?: boolean;
}

export const MappingEditor = ({
  value: mapping,
  onChange,
  className = "",
  style = {},
  keyHeader,
  valueHeader,
  keyPlaceholder = t`Key`,
  valuePlaceholder = t`Value`,
  renderKeyInput = DefaultRenderInput,
  renderValueInput = DefaultRenderInput,
  divider,
  canAdd = true,
  canDelete = true,
  addText = "Add",
  swapKeyAndValue,
}: MappingEditorProps) => {
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
                    leftIcon={<Icon name="close" />}
                    variant="subtle"
                    onClick={() => onChange(removeMapping(mapping, key))}
                    color={"text"}
                    data-testId="remove-mapping"
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
                  leftIcon={<Icon name="add" />}
                  variant="subtle"
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

const addMapping = (mappings: MappingType) => {
  return { ...mappings, "": null };
};

const removeMapping = (mappings: MappingType, prevKey: string) => {
  mappings = { ...mappings };
  delete mappings[prevKey];
  return mappings;
};

const replaceMappingValue = (
  mappings: MappingType,
  oldKey: string,
  newValue: MappingValue,
) => {
  return { ...mappings, [oldKey]: newValue };
};

const replaceMappingKey = (
  mappings: MappingType,
  oldKey: string,
  newKey: string,
) => {
  const newMappings: MappingType = {};
  for (const key in mappings) {
    newMappings[key === oldKey ? newKey : key] = mappings[key];
  }
  return newMappings;
};
