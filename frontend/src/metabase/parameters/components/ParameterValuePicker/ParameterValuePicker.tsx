import { useClickOutside } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { Popover } from "metabase/ui";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";
import type { Parameter, ParameterType, TemplateTag } from "metabase-types/api";

import {
  TextInputIcon,
  TextInputTrirgger,
} from "./ParameterValuePicker.styled";
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
// TODO make controlled outside
// TODO must change value when type is changed
// TODO setting default value on blur/closing picker
// TODO error states
// TODO placeholders
// TODO filter input for numbers
export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const {
    tag,
    parameter,
    value: initialValue,
    onValueChange,
    placeholder,
  } = props;

  if (!parameter) {
    return null;
  }

  // console.log("param", parameter);

  if (shouldShowPlainInput(parameter)) {
    return (
      <PlainValueInput
        value={initialValue}
        onChange={onValueChange}
        placeholder={placeholder}
      />
    );
  }

  if (isDateParameter(parameter)) {
    return (
      <OwnDatePicker
        value={initialValue}
        parameter={parameter}
        onValueChange={onValueChange}
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

// TODO value should reset when changing types
// TODO popover z-index (select inside dropdown)
function OwnDatePicker(props: {
  value: any;
  parameter: Parameter;
  onValueChange: (value: any) => void;
}) {
  const { value, parameter, onValueChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const formatted = formatParameterValue(value, parameter);

  const DateWidget = {
    "date/relative": DateRelativeWidget,
    "date/month-year": DateMonthYearWidget,
    "date/quarter-year": DateQuarterYearWidget,
    // pickers
    "date/single": DateAllOptionsWidget,
    "date/range": DateAllOptionsWidget,
    "date/all-options": DateAllOptionsWidget,
  }[parameter.type];

  const openPopover = () => setIsOpen(true);
  const closePopover = () => setIsOpen(false);

  const [triggerRef, setTriggerRef] = useState<HTMLDivElement | null>(null);
  const ref = useClickOutside(closePopover, null, [triggerRef]);

  // console.log("OwnDatePicker", value, formatted);

  const icon = value ? (
    <TextInputIcon
      name="close"
      onClick={() => {
        onValueChange(null);
        setIsOpen(false);
      }}
    />
  ) : (
    <TextInputIcon name="chevrondown" />
  );

  return (
    <Popover opened={isOpen}>
      <Popover.Target>
        <TextInputTrirgger
          ref={setTriggerRef}
          value={typeof formatted === "string" ? formatted : value ?? ""} // required by Mantine
          readOnly
          placeholder={t`Select a default value…`}
          onClick={openPopover}
          rightSection={icon}
        />
      </Popover.Target>

      <Popover.Dropdown>
        <div ref={ref}>
          {DateWidget ? (
            <DateWidget
              value={value}
              initialValue={getInitialDateValue(
                value,
                parameter.type as ParameterType,
              )}
              onClose={closePopover}
              setValue={onValueChange}
            />
          ) : (
            "<none>"
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function getInitialDateValue(value: any, parameterType: ParameterType) {
  if (value == null) {
    if (parameterType === "date/single") {
      return getIsoDate();
    }

    if (parameterType === "date/range") {
      const now = getIsoDate();
      return `${now}~${now}`;
    }
  }

  return value;
}

function getIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
