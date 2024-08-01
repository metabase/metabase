import { Component } from "react";
import _ from "underscore";
import {
  AM_PM_OPTIONS,
  getDayOfWeekOptions,
  HOUR_OPTIONS,
} from "metabase/lib/date-time";



export class AlertScheduleText extends Component {
  getScheduleText = () => {
    const { schedule, verbose } = this.props;
    const scheduleType = schedule.schedule_type;

    // these are pretty much copy-pasted from SchedulePicker
    if (scheduleType === "hourly") {
      return verbose ? "hourly" : "Hourly";
    } else if (scheduleType === "daily") {
      const hourOfDay = schedule.schedule_hour;
      const hour = _.find(
        HOUR_OPTIONS,
        opt => opt.value === hourOfDay % 12,
      ).name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      ).name;

      return `${verbose ? "daily at " : "Daily, "} ${hour} ${amPm}`;
    } else if (scheduleType === "weekly") {
      const hourOfDay = schedule.schedule_hour;
      const dayOfWeekOptions = getDayOfWeekOptions();

      const day = _.find(
        dayOfWeekOptions,
        o => o.value === schedule.schedule_day,
      ).name;
      const hour = _.find(
        HOUR_OPTIONS,
        opt => opt.value === hourOfDay % 12,
      ).name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      ).name;

      if (verbose) {
        return `weekly on ${day}s at ${hour} ${amPm}`;
      } else {
        // omit the minute part of time
        return `${day}s, ${hour.substr(0, hour.indexOf(":"))} ${amPm}`;
      }
    }
  };

  render() {
    const { verbose } = this.props;

    const scheduleText = this.getScheduleText();

    if (verbose) {
      return (
        <span>
          Checking <b>{scheduleText}</b>
        </span>
      );
    } else {
      return <span>{scheduleText}</span>;
    }
  }
}
