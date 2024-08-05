import { useClickOutside } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { Popover } from "metabase/ui";
import type {
  DateParameterType,
  Parameter,
  ParameterType,
} from "metabase-types/api";

import { PickerIcon, TextInputTrirgger } from "../ParameterValuePicker.styled";

interface OwnDatePickerProps {
  value: string;
  onChange: (value: string | null) => void;
  parameter: Parameter;
  placeholder: string;
}

export function OwnDatePicker(props: OwnDatePickerProps) {
  const { value, parameter, onChange, placeholder } = props;
  const [isOpen, setIsOpen] = useState(false);
  const formatted = formatParameterValue(value, parameter);
  // TODO fix Parameter types (metabase#40226)
  const parameterType = parameter.type as DateParameterType;

  const openPopover = () => setIsOpen(true);
  const closePopover = () => setIsOpen(false);

  const [triggerRef, setTriggerRef] = useState<HTMLDivElement | null>(null);

  // TODO this should be not needed (metabase#40226)
  const dropdownRef = useClickOutside(closePopover, null, [triggerRef]);

  const icon = value ? (
    <PickerIcon
      aria-label={t`Clear`}
      name="close"
      onClick={() => {
        onChange(null);
        closePopover();
      }}
    />
  ) : (
    <PickerIcon name="chevrondown" />
  );
  // This is required to allow clicking through the "chevrondown" icon.
  // Must be replaced with `rightSectionPointerEvents=none` after upgrade
  const rightSectionProps = value
    ? undefined
    : { style: { pointerEvents: "none" } };

  // TODO this should be removed as soon as we reconcile all dropdowns
  // and make them use Mantine (metabase#40226)
  const zIndex = hasInnerPopovers(parameterType) ? 3 : undefined;

  return (
    <Popover opened={isOpen} zIndex={zIndex}>
      <Popover.Target>
        <TextInputTrirgger
          ref={setTriggerRef}
          value={typeof formatted === "string" ? formatted : value ?? ""} // required by Mantine
          readOnly
          placeholder={placeholder}
          onClick={openPopover}
          rightSection={icon}
          rightSectionProps={rightSectionProps}
        />
      </Popover.Target>

      <Popover.Dropdown>
        <div ref={dropdownRef}>
          <DateComponentRouter
            type={parameterType}
            value={value}
            onClose={closePopover}
            setValue={onChange}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function DateComponentRouter(props: {
  type: DateParameterType;
  value: string;
  setValue: (value: string | null) => void;
  onClose: () => void;
}) {
  const { type, ...restProps } = props;
  const componentProps = {
    ...restProps,
    initialValue: DEPRECATED_getInitialDateValue(props.value, type),
  };

  switch (type) {
    case "date/relative":
      return (
        <DateRelativeWidget
          {...componentProps}
          // TODO fix types (metabase#40226)
          setValue={val => props.setValue(val ?? null)}
        />
      );
    case "date/month-year":
      return <DateMonthYearWidget {...componentProps} />;
    case "date/quarter-year":
      return <DateQuarterYearWidget {...componentProps} />;

    case "date/single":
    case "date/range":
      return (
        <DateAllOptionsWidget disableOperatorSelection {...componentProps} />
      );

    case "date/all-options":
      return <DateAllOptionsWidget {...componentProps} />;
  }

  // should never happen
  return null;
}

function hasInnerPopovers(type: DateParameterType) {
  return ["date/relative", "date/month-year", "date/quarter-year"].includes(
    type,
  );
}

// TODO this should be in the Lib or somewhere else (metabase#40226)
function DEPRECATED_getInitialDateValue(
  value: string | undefined,
  parameterType: ParameterType,
) {
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
