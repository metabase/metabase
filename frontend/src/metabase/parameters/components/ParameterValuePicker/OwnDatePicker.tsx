import { useClickOutside } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { DateAllOptionsWidget } from "metabase/components/DateAllOptionsWidget";
import { DateMonthYearWidget } from "metabase/components/DateMonthYearWidget";
import { DateQuarterYearWidget } from "metabase/components/DateQuarterYearWidget";
import { DateRelativeWidget } from "metabase/components/DateRelativeWidget";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { Popover } from "metabase/ui";
import type { Parameter, ParameterType } from "metabase-types/api";

import {
  TextInputIcon,
  TextInputTrirgger,
} from "./ParameterValuePicker.styled";

export function OwnDatePicker(props: {
  value: string;
  onValueChange: (value: string | null) => void;
  parameter: Parameter;
}) {
  const { value, parameter, onValueChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const formatted = formatParameterValue(value, parameter);

  const openPopover = () => setIsOpen(true);
  const closePopover = () => setIsOpen(false);

  const [triggerRef, setTriggerRef] = useState<HTMLDivElement | null>(null);
  const dropdownRef = useClickOutside(closePopover, null, [triggerRef]);

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
  // This is required to allow clicking through the "chevrondown" icon.
  // Must be replaced with `rightSectionPointerEvents=none` after upgrade
  const rightSectionProps = value
    ? undefined
    : { style: { pointerEvents: "none" } };

  // TODO this should be removed as soon as we reconcile all dropdowns and make them use Mantine
  const Z_INDEX = 2;

  return (
    <Popover opened={isOpen} zIndex={Z_INDEX}>
      <Popover.Target>
        <TextInputTrirgger
          ref={setTriggerRef}
          value={typeof formatted === "string" ? formatted : value ?? ""} // required by Mantine
          readOnly
          placeholder={t`Select a default value…`}
          onClick={openPopover}
          rightSection={icon}
          rightSectionProps={rightSectionProps}
        />
      </Popover.Target>

      <Popover.Dropdown>
        <div ref={dropdownRef}>
          <DateComponentRouter
            type={parameter.type as ParameterType}
            value={value}
            onClose={closePopover}
            setValue={onValueChange}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function DateComponentRouter(props: {
  type: ParameterType;
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
          // TODO fix types
          setValue={val => props.setValue(val ?? null)}
        />
      );
    case "date/month-year":
      return <DateMonthYearWidget {...componentProps} />;
    case "date/quarter-year":
      return <DateQuarterYearWidget {...componentProps} />;

    case "date/single":
    case "date/range":
    case "date/all-options":
      return <DateAllOptionsWidget {...componentProps} />;
  }

  // TODO should never happen
  return null;
}

// TODO this should be in the Lib or somewhere else
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
