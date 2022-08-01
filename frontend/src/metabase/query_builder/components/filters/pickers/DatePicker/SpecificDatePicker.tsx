/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import { getDateStyleFromSettings } from "metabase/lib/time";
import Calendar, { SelectAll } from "metabase/components/Calendar";
import InputBlurChange from "metabase/components/InputBlurChange";
import ExpandingContent from "metabase/components/ExpandingContent";
import HoursMinutesInput from "./HoursMinutesInput";

import moment, { Moment } from "moment-timezone";
import { getTimeComponent, setTimeComponent } from "metabase/lib/query_time";
import { CalendarIcon } from "./SpecificDatePicker.styled";

type Props = {
  className?: string;
  primaryColor?: string;
  calendar?: boolean;
  selectAll?: SelectAll;

  hideTimeSelectors?: boolean;
  value: string;
  onChange: (startValue: string | null, endValue?: string) => void;
  onClear?: () => void;
};

const SpecificDatePicker: React.FC<Props> = props => {
  const onChange = (
    date?: string | Moment,
    hours?: number | null,
    minutes?: number | null,
  ) => {
    props.onChange(setTimeComponent(date, hours, minutes));
  };

  const {
    value,
    calendar,
    hideTimeSelectors,
    onClear,
    className,
    selectAll,
    primaryColor,
  } = props;
  const [showCalendar, setShowCalendar] = React.useState(true);

  const { hours, minutes, date } = getTimeComponent(value);

  const showTimeSelectors =
    !hideTimeSelectors &&
    typeof hours === "number" &&
    typeof minutes === "number";
  const dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY";

  return (
    <div className={className} data-testid="specific-date-picker">
      <div className="mb2 full bordered rounded flex align-center">
        <InputBlurChange
          placeholder={moment().format(dateFormat)}
          className="borderless full p1 h3"
          style={{
            outline: "none",
          }}
          value={date ? date.format(dateFormat) : ""}
          onBlurChange={({ target: { value } }: any) => {
            const date = moment(value, dateFormat);
            if (date.isValid()) {
              onChange(date, hours, minutes);
            } else {
              onChange();
            }
          }}
        />

        {calendar && (
          <CalendarIcon
            name="calendar"
            onClick={() => setShowCalendar(!showCalendar)}
            tooltip={showCalendar ? t`Hide calendar` : t`Show calendar`}
          />
        )}
      </div>

      {showTimeSelectors && (
        <div>
          <HoursMinutesInput
            onClear={onClear}
            hours={hours}
            minutes={minutes}
            onChangeHours={(hours: number) => onChange(date, hours, minutes)}
            onChangeMinutes={(minutes: number) =>
              onChange(date, hours, minutes)
            }
          />
        </div>
      )}

      {calendar && (
        <ExpandingContent isOpen={showCalendar}>
          <Calendar
            selected={date}
            initial={date || moment()}
            onChange={value => onChange(value, hours, minutes)}
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
