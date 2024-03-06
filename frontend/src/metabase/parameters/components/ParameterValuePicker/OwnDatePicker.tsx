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

// TODO popover z-index (select inside dropdown)
export function OwnDatePicker(props: {
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
  // This is required to allow clicking through the "chevrondown" icon.
  // Must be replaced with `rightSectionPointerEvents=none` after upgrade
  const rightSectionProps = value
    ? undefined
    : { style: { pointerEvents: "none" } };

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
          rightSectionProps={rightSectionProps}
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
