/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import { getDateStyleFromSettings } from "metabase/lib/time";
import Calendar, { SelectAll } from "metabase/components/Calendar";
import InputBlurChange from "metabase/components/InputBlurChange";
import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";
import HoursMinutesInput from "./HoursMinutesInput";

import moment from "moment";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { TimeContainer } from "./SpecificDatePicker.styled";
import { getTimeComponent, setTimeComponent } from "metabase/lib/query_time";

type BetweenPickerProps = {
  isSidebar?: boolean;
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

export const BetweenPicker = ({
  className,
  isSidebar,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
}: BetweenPickerProps) => (
  <div className={className}>
    <TimeContainer isSidebar={isSidebar}>
      <div>
        <SpecificDatePicker
          value={startValue}
          hideTimeSelectors={hideTimeSelectors}
          onChange={value => onFilterChange([op, field, value, endValue])}
        />
      </div>
      <div>
        <SpecificDatePicker
          value={endValue}
          hideTimeSelectors={hideTimeSelectors}
          onClear={() =>
            onFilterChange([
              op,
              field,
              setTimeComponent(startValue),
              setTimeComponent(endValue),
            ])
          }
          onChange={value => onFilterChange([op, field, startValue, value])}
        />
      </div>
    </TimeContainer>
    <div className="Calendar--noContext">
      <Calendar
        isRangePicker
        initial={startValue ? moment(startValue) : moment()}
        selected={startValue && moment(startValue)}
        selectedEnd={endValue && moment(endValue)}
        onChange={(startValue, endValue) =>
          onFilterChange([op, field, startValue, endValue])
        }
      />
    </div>
  </div>
);

type SingleDatePickerProps = {
  className?: string;
  filter: Filter;
  selectAll?: SelectAll;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

export const SingleDatePicker = ({
  className,
  filter: [op, field, value],
  onFilterChange,
  hideTimeSelectors,
  selectAll,
}: SingleDatePickerProps) => (
  <SpecificDatePicker
    className={className}
    value={value}
    selectAll={selectAll}
    onChange={value => onFilterChange([op, field, value])}
    onClear={() => onFilterChange([op, field, setTimeComponent(value)])}
    hideTimeSelectors={hideTimeSelectors}
    calendar
  />
);

export const BeforePicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="before" />;
};

export const AfterPicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="after" />;
};

type Props = {
  className?: string;
  isSidebar?: boolean;
  calendar?: boolean;
  selectAll?: SelectAll;

  hideTimeSelectors?: boolean;
  value: string;
  onChange: (startValue: string | null, endValue?: string) => void;
  onClear?: () => void;
};

type State = {
  showCalendar: boolean;
};

const SpecificDatePicker: React.SFC<Props> = props => {
  const onChange = (
    date?: string | moment.Moment,
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
  } = props;
  const [showCalendar, setShowCalendar] = React.useState(true);

  const { hours, minutes, date } = getTimeComponent(value);

  const showTimeSelectors =
    !hideTimeSelectors &&
    typeof hours === "number" &&
    typeof minutes === "number";
  const dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY";

  return (
    <div className={className}>
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
          <Icon
            className="mr1 text-purple-hover cursor-pointer"
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
          />
        </ExpandingContent>
      )}
    </div>
  );
};

export default SpecificDatePicker;
