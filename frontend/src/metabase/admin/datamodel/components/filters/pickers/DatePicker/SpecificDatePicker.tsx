import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { useState } from "react";
import { t } from "ttag";

import type { SelectAll } from "metabase/components/Calendar";
import Calendar from "metabase/components/Calendar";
import ExpandingContent from "metabase/components/ExpandingContent";
import InputBlurChange from "metabase/components/InputBlurChange";
import { getDateStyleFromSettings } from "metabase/lib/time";
import {
  getTimeComponent,
  setTimeComponent,
} from "metabase-lib/v1/queries/utils/query-time";

import HoursMinutesInput from "./HoursMinutesInput";
import { DateInputContainer } from "./SpecificDatePicker.styled";

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
  const [showCalendar, setShowCalendar] = useState(true);
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
        <InputBlurChange
          placeholder={moment().format(dateFormat)}
          value={date ? date.format(dateFormat) : ""}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlurChange={({ target: { value } }) => {
            const date = moment(value, dateFormat);
            if (date.isValid()) {
              handleChange(date, hours, minutes);
            } else {
              handleChange();
            }
          }}
          rightIcon={hasCalendar ? "calendar" : undefined}
          onRightIconClick={() => setShowCalendar(!showCalendar)}
          rightIconTooltip={showCalendar ? t`Hide calendar` : t`Show calendar`}
        />
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SpecificDatePicker;
