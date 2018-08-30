/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Calendar from "metabase/components/Calendar";
import InputBlurChange from "metabase/components/InputBlurChange";
import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";
import Tooltip from "metabase/components/Tooltip";
import HoursMinutesInput from "./HoursMinutesInput";

import moment from "moment";
import cx from "classnames";

const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

type Props = {
  value: ?string,
  onChange: (value: ?string) => void,
  calendar?: boolean,
  hideTimeSelectors?: boolean,
};

type State = {
  showCalendar: boolean,
};

export default class SpecificDatePicker extends Component {
  props: Props;
  state: State;

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

  onChange = (date: ?string, hours: ?number, minutes: ?number) => {
    let m = moment(date);
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
    const { value, calendar, hideTimeSelectors } = this.props;
    const { showCalendar } = this.state;

    let date, hours, minutes;
    if (moment(value, DATE_TIME_FORMAT, true).isValid()) {
      date = moment(value, DATE_TIME_FORMAT, true);
      hours = date.hours();
      minutes = date.minutes();
      date.startOf("day");
    } else if (moment(value, DATE_FORMAT, true).isValid()) {
      date = moment(value, DATE_FORMAT, true);
    }

    return (
      <div>
        <div className="flex align-center mb1">
          <div
            className={cx("border-top border-bottom full border-left", {
              "border-right": !calendar,
            })}
          >
            <InputBlurChange
              placeholder={moment().format("MM/DD/YYYY")}
              className="borderless full p2 h3"
              style={{
                outline: "none",
              }}
              value={date ? date.format("MM/DD/YYYY") : ""}
              onBlurChange={({ target: { value } }) => {
                let date = moment(value, "MM/DD/YYYY");
                if (date.isValid()) {
                  this.onChange(date, hours, minutes);
                } else {
                  this.onChange(null);
                }
              }}
              ref="value"
            />
          </div>
          {calendar && (
            <div className="border-right border-bottom border-top p2">
              <Tooltip
                tooltip={showCalendar ? t`Hide calendar` : t`Show calendar`}
                children={
                  <Icon
                    className="text-purple-hover cursor-pointer"
                    name="calendar"
                    onClick={() =>
                      this.setState({ showCalendar: !this.state.showCalendar })
                    }
                  />
                }
              />
            </div>
          )}
        </div>

        {calendar && (
          <ExpandingContent open={showCalendar}>
            <Calendar
              selected={date}
              initial={date || moment()}
              onChange={value => this.onChange(value, hours, minutes)}
              isRangePicker={false}
            />
          </ExpandingContent>
        )}

        {!hideTimeSelectors && (
          <div className={cx({ py2: calendar }, { mb3: !calendar })}>
            {hours == null || minutes == null ? (
              <div
                className="text-purple-hover cursor-pointer flex align-center"
                onClick={() => this.onChange(date, 12, 30)}
              >
                <Icon className="mr1" name="clock" />
                Add a time
              </div>
            ) : (
              <HoursMinutesInput
                onClear={() => this.onChange(date, null, null)}
                hours={hours}
                minutes={minutes}
                onChangeHours={hours => this.onChange(date, hours, minutes)}
                onChangeMinutes={minutes => this.onChange(date, hours, minutes)}
              />
            )}
          </div>
        )}
      </div>
    );
  }
}
