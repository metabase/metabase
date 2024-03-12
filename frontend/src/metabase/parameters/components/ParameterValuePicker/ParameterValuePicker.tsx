import { t } from "ttag";

import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { ListPickerConnected } from "./ListPickerConnected";
import { OwnDatePicker } from "./OwnDatePicker";
import { PlainValueInput } from "./PlainValueInput";
import { shouldUsePlainInput, shouldUseListPicker } from "./core";

interface ParameterValuePickerProps {
  tag: TemplateTag;
  parameter: Parameter;
  value: any;
  onValueChange: (value: any) => void;
}

// TODO setting default value on blur/closing picker
// TODO error states
// TODO filter input for numbers

/**
 * This component is designed to be controlled outside,
 * without keeping its own state.
 */
export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const { tag, parameter, value, onValueChange } = props;

  if (!parameter) {
    return null;
  }

  if (shouldUsePlainInput(parameter)) {
    return (
      <PlainValueInput
        value={value}
        onChange={onValueChange}
        placeholder={t`Enter a default value…`}
      />
    );
  }

  if (isDateParameter(parameter)) {
    return (
      <OwnDatePicker
        value={value}
        parameter={parameter}
        onChange={onValueChange}
        placeholder={t`Select a default value…`}
      />
    );
  }

  if (shouldUseListPicker(parameter)) {
    return (
      <ListPickerConnected
        value={(Array.isArray(value) ? value[0] : value) ?? ""} // TODO
        parameter={parameter}
        onChange={onValueChange}
        forceSearchItemCount={50}
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
