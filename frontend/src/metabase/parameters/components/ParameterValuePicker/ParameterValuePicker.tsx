import type { ChangeEvent, KeyboardEvent } from "react";
import { useState } from "react";
import _ from "underscore";

import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { Icon, TextInput } from "metabase/ui";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { isPlainInput } from "./core";

interface ParameterValuePickerProps {
  tag: TemplateTag;
  parameter: Parameter;
  initialValue: any;
  onValueChange: (value: any) => void;
  placeholder?: string;
}

export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const { tag, parameter, initialValue, onValueChange, placeholder } = props;

  if (!parameter) {
    return null;
  }

  if (isPlainInput(parameter)) {
    return (
      <PlainValueInput
        initialValue={initialValue}
        onValueChange={onValueChange}
        placeholder={placeholder}
      />
    );
  }

  // The fallback
  return (
    <DefaultParameterValueWidget
      parameter={getAmendedParameter(tag, parameter)}
      value={initialValue}
      setValue={onValueChange}
      isEditing
      commitImmediately
      mimicMantine
    />
  );
}

interface PlainValueInputProps {
  initialValue: any;
  onValueChange: (value: any) => void;
  placeholder?: string;
}

function PlainValueInput(props: PlainValueInputProps) {
  const { initialValue, onValueChange, placeholder } = props;
  // TODO must change when changing filter types
  const [value, setValue] = useState(initialValue);

  const commit = (newValue: any) => {
    setValue(newValue);
    onValueChange(newValue);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    commit(event.currentTarget.value);
  };

  const handleKeyup = (event: KeyboardEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement;
    switch (event.key) {
      case "Enter":
        onValueChange(value);
        target.blur();
        break;
      case "Escape":
        target.blur();
        break;
      default:
        break;
    }
  };

  return (
    <TextInput
      value={value}
      onChange={handleChange}
      onKeyUp={handleKeyup}
      placeholder={placeholder}
      rightSection={
        value ? (
          // TODO value must be null
          <Icon cursor="pointer" name="close" onClick={() => commit("")} />
        ) : null
      }
    />
  );
}

// function getFirstValue(value: any) {
//   if (Array.isArray(value)) {
//     return value[0] ?? null;
//   }
//   return value;
// }

function getAmendedParameter(tag: TemplateTag, parameter: Parameter) {
  const amended =
    tag.type === "text" || tag.type === "dimension"
      ? parameter || {
          fields: [],
          ...tag,
          type: tag["widget-type"] || null,
        }
      : {
          fields: [],
          hasVariableTemplateTagTarget: true,
          type:
            tag["widget-type"] || (tag.type === "date" ? "date/single" : null),
        };

  // We want to remove "default" and "required" so that it
  // doesn't show up in the default value input icon
  return _.omit(amended, "default", "required");
}
