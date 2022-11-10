import React from "react";
import { t } from "ttag";

import moment, { Moment } from "moment-timezone";
import { getDateStyleFromSettings } from "metabase/lib/time";
import Calendar, { SelectAll } from "metabase/components/Calendar";
import ExpandingContent from "metabase/components/ExpandingContent";
import {
  getTimeComponent,
  setTimeComponent,
} from "metabase-lib/queries/utils/query-time";
import HoursMinutesInput from "./HoursMinutesInput";

import {
  CalendarIcon,
  DateInput,
  DateInputContainer,
} from "./SpecificDatePicker.styled";

interface SpecificDatePickerProps {
  className?: string;
  value: string;
  primaryColor?: string;
  selectAll?: SelectAll;
  isActive?: boolean;
  hasCalendar?: boolean;
  hideTimeSelectors?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  onChange: (startValue: string | null, endValue?: string) => void;
  onClear?: () => void;
}

const SpecificDatePicker = ({
  className,
  value,
  primaryColor,
  selectAll,
  isActive,
  hasCalendar,
  hideTimeSelectors,
  autoFocus,
  onFocus,
  onChange,
  onClear,
}: SpecificDatePickerProps) => {
  const [showCalendar, setShowCalendar] = React.useState(true);
  const { hours, minutes, date } = getTimeComponent(value);

  const showTimeSelectors =
    !hideTimeSelectors &&
    typeof hours === "number" &&
    typeof minutes === "number";

  const handleChange = (
    date?: string | Moment,
    hours?: number | null,
    minutes?: number | null,
  ) => {
    onChange(setTimeComponent(date, hours, minutes));
  };
  const dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY";

  return (
    <div className={className} data-testid="specific-date-picker">
      <DateInputContainer isActive={isActive}>
        <DateInput
          placeholder={moment().format(dateFormat)}
          value={date ? date.format(dateFormat) : ""}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlurChange={({ target: { value } }: any) => {
            const date = moment(value, dateFormat);
            if (date.isValid()) {
              handleChange(date, hours, minutes);
            } else {
              handleChange();
            }
          }}
        />

        {hasCalendar && (
          <CalendarIcon
            name="calendar"
            onClick={() => setShowCalendar(!showCalendar)}
            tooltip={showCalendar ? t`Hide calendar` : t`Show calendar`}
          />
        )}
      </DateInputContainer>

      {showTimeSelectors && (
        <div>
          <HoursMinutesInput
            onClear={onClear}
            hours={hours}
            minutes={minutes}
            onChangeHours={(hours: number) =>
              handleChange(date, hours, minutes)
            }
            onChangeMinutes={(minutes: number) =>
              handleChange(date, hours, minutes)
            }
          />
        </div>
      )}

      {hasCalendar && (
        <ExpandingContent isOpen={showCalendar}>
          <Calendar
            selected={date}
            initial={date || moment()}
            onChange={value => handleChange(value, hours, minutes)}
            isRangePicker={false}
            selectAll={selectAll}
            primaryColor={primaryColor}
          />
        </ExpandingContent>
      )}
    </div>
  );
};

export default SpecificDatePicker;
