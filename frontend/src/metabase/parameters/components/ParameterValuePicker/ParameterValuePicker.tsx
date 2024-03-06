import _ from "underscore";

import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { OwnDatePicker } from "./OwnDatePicker";
import { PlainValueInput } from "./PlainValueInput";
import { shouldShowPlainInput } from "./core";

interface ParameterValuePickerProps {
  tag: TemplateTag;
  parameter: Parameter;
  value: any;
  onValueChange: (value: any) => void;
  placeholder?: string;
}

// TODO multiple value pickers
// TODO setting default value on blur/closing picker
// TODO error states
// TODO placeholders unification
// TODO filter input for numbers

/**
 * This component is designed to be controlled outside,
 * without keeping its own state.
 */
export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const { tag, parameter, value, onValueChange, placeholder } = props;

  if (!parameter) {
    return null;
  }

  if (shouldShowPlainInput(parameter)) {
    return (
      <PlainValueInput
        value={value}
        onChange={onValueChange}
        placeholder={placeholder}
      />
    );
  }

  if (isDateParameter(parameter)) {
    return (
      <OwnDatePicker
        value={value}
        parameter={parameter}
        onValueChange={onValueChange}
      />
    );
  }

  // The fallback
  return (
    <DefaultParameterValueWidget
      parameter={DEPRECATED_getAmendedParameter(tag, parameter)}
      value={value}
      setValue={onValueChange}
      isEditing
      commitImmediately
      mimicMantine
    />
  );
}

function DEPRECATED_getAmendedParameter(
  tag: TemplateTag,
  parameter: Parameter,
) {
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
