import type { ChangeEvent, KeyboardEvent } from "react";
import { /*useEffect,*/ useState } from "react";
import _ from "underscore";

import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { Icon, Popover, TextInput } from "metabase/ui";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { /*shouldShowDatePicker,*/ shouldShowPlainInput } from "./core";
import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { DateMonthYearWidget } from "metabase/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";

interface ParameterValuePickerProps {
  tag: TemplateTag;
  parameter: Parameter;
  initialValue: any;
  onValueChange: (value: any) => void;
  placeholder?: string;
}

// TODO must change value when type is changed
export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const { tag, parameter, initialValue, onValueChange, placeholder } = props;

  if (!parameter) {
    return null;
  }

  console.log("param", parameter);

  if (shouldShowPlainInput(parameter)) {
    return (
      <PlainValueInput
        initialValue={initialValue}
        onValueChange={onValueChange}
        placeholder={placeholder}
      />
    );
  }

  const formatted =
    formatParameterValue(initialValue, parameter) ?? "<placeholder>";

  // if (shouldShowDatePicker(parameter)) {
  //   return "DATE";
  // }

  // The fallback
  return (
    <>
      {isDateParameter(parameter) && (
        <OwnDatePicker value={initialValue} parameter={parameter} />
      )}

      <div style={{ outline: "2px solid lime;" }}>{formatted}</div>

      <DefaultParameterValueWidget
        parameter={getAmendedParameter(tag, parameter)}
        value={initialValue}
        setValue={onValueChange}
        isEditing
        commitImmediately
        mimicMantine
      />
    </>
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

function OwnDatePicker(props: { value: any; parameter: Parameter }) {
  const { value, parameter } = props;
  const formatted = formatParameterValue(value, parameter) ?? "<placeholder>";

  const DateWidget = {
    // "date/single": DateAllOptionsWidget,
    // "date/range": DateAllOptionsWidget,
    "date/relative": DateRelativeWidget,
    "date/month-year": DateMonthYearWidget,
    "date/quarter-year": DateQuarterYearWidget,
    "date/all-options": DateAllOptionsWidget,
  }[parameter.type];

  return (
    <Popover>
      <Popover.Target>
        <div>
          {formatted}
          <TextInput
            value={value}
            // disabled
            readOnly
            // onChange={handleChange}
            // onKeyUp={handleKeyup}
            placeholder="Select a default value..."
            // rightSection={
            //   value ? (
            //     // TODO value must be null
            //     <Icon cursor="pointer" name="close" onClick={() => commit("")} />
            //   ) : null
            // }
          />
        </div>
      </Popover.Target>

      <Popover.Dropdown>
        {DateWidget ? (
          <DateWidget value={value} onClose={() => {}} setValue={() => {}} />
        ) : (
          "<none>"
        )}
        {/* <DateAllOptionsWidget
          disableOperatorSelection
          value={value}
          onClose={() => {}}
          setValue={() => {}}
        /> */}
      </Popover.Dropdown>
    </Popover>
  );
}
