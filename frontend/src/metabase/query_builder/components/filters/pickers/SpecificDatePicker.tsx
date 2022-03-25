/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
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

const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

export const getTimeComponent = (value: string) => {
  let hours: number | null = null;
  let minutes: number | null = null;
  let date: moment.Moment;
  if (moment(value, DATE_TIME_FORMAT, true).isValid()) {
    date = moment(value, DATE_TIME_FORMAT, true);
    hours = date.hours();
    minutes = date.minutes();
    date.startOf("day");
  } else if (moment(value, DATE_FORMAT, true).isValid()) {
    date = moment(value, DATE_FORMAT, true);
  } else {
    date = moment();
  }
  return { hours, minutes, date };
};

export const setTimeComponent = (
  value?: string | moment.Moment,
  hours?: number | null,
  minutes?: number | null,
) => {
  const m = moment(value);
  if (!m.isValid()) {
    return null;
  }

  let hasTime = false;
  if (typeof hours === "number" && typeof minutes === "number") {
    m.hours(hours);
    m.minutes(minutes);
    hasTime = true;
  }

  if (hasTime) {
    return m.format(DATE_TIME_FORMAT);
  } else {
    return m.format(DATE_FORMAT);
  }
};

type BetweenPickerProps = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

export const BetweenPicker = ({
  className,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
}: BetweenPickerProps) => (
  <div className={className}>
    <TimeContainer>
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

export default class SpecificDatePicker extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      showCalendar: true,
    };
  }

  static propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
  };

  onChange = (
    date?: string | moment.Moment,
    hours?: number | null,
    minutes?: number | null,
  ) => {
    this.props.onChange(setTimeComponent(date, hours, minutes));
  };

  render() {
    const {
      value,
      calendar,
      hideTimeSelectors,
      onClear,
      className,
      selectAll,
    } = this.props;
    const { showCalendar } = this.state;

    const { hours, minutes, date } = getTimeComponent(value);

    const showTimeSelectors =
      !hideTimeSelectors &&
      typeof hours === "number" &&
      typeof minutes === "number";
    const dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY";

    return (
      <div className={className}>
        {!calendar ? (
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
                  this.onChange(date, hours, minutes);
                } else {
                  this.onChange();
                }
              }}
            />

            {calendar && (
              <Icon
                className="mr1 text-purple-hover cursor-pointer"
                name="calendar"
                onClick={() =>
                  this.setState({ showCalendar: !this.state.showCalendar })
                }
                tooltip={showCalendar ? t`Hide calendar` : t`Show calendar`}
              />
            )}
          </div>
        ) : null}

        {showTimeSelectors && (
          <div>
            <HoursMinutesInput
              onClear={onClear}
              hours={hours}
              minutes={minutes}
              onChangeHours={(hours: number) =>
                this.onChange(date, hours, minutes)
              }
              onChangeMinutes={(minutes: number) =>
                this.onChange(date, hours, minutes)
              }
            />
          </div>
        )}

        {calendar && (
          <ExpandingContent isOpen={showCalendar}>
            <Calendar
              selected={date}
              initial={date || moment()}
              onChange={value => this.onChange(value, hours, minutes)}
              isRangePicker={false}
              selectAll={selectAll}
            />
          </ExpandingContent>
        )}
      </div>
    );
  }
}
