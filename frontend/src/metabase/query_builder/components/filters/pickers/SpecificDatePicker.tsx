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
import cx from "classnames";
import Filter from "metabase-lib/lib/queries/structured/Filter";

const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

const TIME_SELECTOR_DEFAULT_HOUR = 12;
const TIME_SELECTOR_DEFAULT_MINUTE = 30;

type BetweenPickerProps = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  hideTimeSelectors: () => void;
};

export const BetweenPicker = ({
  className,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
}: BetweenPickerProps) => (
  <div className={className}>
    <div className="Grid Grid--1of2 Grid--gutters">
      <div className="Grid-cell">
        <SpecificDatePicker
          value={startValue}
          hideTimeSelectors={hideTimeSelectors}
          onChange={value => onFilterChange([op, field, value, endValue])}
        />
      </div>
      <div className="Grid-cell">
        <SpecificDatePicker
          value={endValue}
          hideTimeSelectors={hideTimeSelectors}
          onChange={value => onFilterChange([op, field, startValue, value])}
        />
      </div>
    </div>
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
  hideTimeSelectors: () => void;
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
  hideTimeSelectors: () => void;
  value: string;
  onChange: (startValue: string | null, endValue?: string) => void;
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
    const m = moment(date);
    if (!m.isValid()) {
      this.props.onChange(null);
    }

    let hasTime = false;
    if (hours != null) {
      m.hours(hours);
      hasTime = true;
    }
    if (minutes != null) {
      m.minutes(minutes);
      hasTime = true;
    }

    if (hasTime) {
      this.props.onChange(m.format(DATE_TIME_FORMAT));
    } else {
      this.props.onChange(m.format(DATE_FORMAT));
    }
  };

  render() {
    const {
      value,
      calendar,
      hideTimeSelectors,
      className,
      selectAll,
    } = this.props;
    const { showCalendar } = this.state;

    let date: moment.Moment,
      hours: number | undefined,
      minutes: number | undefined;
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

        {/* {!hideTimeSelectors && (
          <div>
            <HoursMinutesInput
              onClear={() => this.onChange(date, null, null)}
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
        )} */}
      </div>
    );
  }
}
