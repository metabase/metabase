/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import Select from "metabase/components/Select.jsx";

import Settings from "metabase/lib/settings";
import { capitalize } from "metabase/lib/formatting";

import _ from "underscore";

const HOUR_OPTIONS = _.times(12, (n) => (
    { name: (n === 0 ? 12 : n)+":00", value: n }
));

const AM_PM_OPTIONS = [
    { name: "AM", value: 0 },
    { name: "PM", value: 1 }
];

const DAY_OF_WEEK_OPTIONS = [
    { name: "Sunday", value: "sun" },
    { name: "Monday", value: "mon" },
    { name: "Tuesday", value: "tue" },
    { name: "Wednesday", value: "wed" },
    { name: "Thursday", value: "thu" },
    { name: "Friday", value: "fri" },
    { name: "Saturday", value: "sat" }
];

const MONTH_DAY_OPTIONS = [
    { name: "First", value: "first" },
    { name: "Last", value: "last" },
    { name: "15th (Midpoint)", value: "mid" }
];

/**
 * Picker for selecting a hourly/daily/weekly/monthly schedule.
 *
 * TODO Atte Keinänen 6/30/17: This could use text input fields instead of dropdown for time (hour + AM/PM) pickers
 */
export default class SchedulePicker extends Component {
    // TODO: How does this tread an empty schedule?

    static propTypes = {
        // the currently chosen schedule, e.g. { schedule_day: "mon", schedule_frame: "null", schedule_hour: 4, schedule_type: "daily" }
        schedule: PropTypes.object.isRequired,
        // TODO: hourly option?
        // available schedules, e.g. [ "daily", "weekly", "monthly"]
        scheduleOptions: PropTypes.object.isRequired,
        // text prepended to "12:00 PM PST, your Metabase timezone"
        textBeforeSendTime: PropTypes.string,
        onScheduleChange: PropTypes.func.isRequired,
    };

    onPropertyChange(name, value) {
        let newSchedule = {
            ...this.props.schedule,
            [name]: value
        };

        if (name === "schedule_type") {
            // clear out other values than schedule_type for hourly schedule
            if (value === "hourly") {
                newSchedule = { ...newSchedule, "schedule_day": null, "schedule_frame": null, "schedule_hour": null };
            }

            // default to midnight for all schedules other than hourly
            if (value !== "hourly") {
                newSchedule = { ...newSchedule, "schedule_hour": newSchedule.schedule_hour || 0 }
            }

            // clear out other values than schedule_type and schedule_day for daily schedule
            if (value === "daily") {
                newSchedule = { ...newSchedule, "schedule_day": null, "schedule_frame": null };
            }

            // default to Monday when user wants a weekly schedule + clear out schedule_frame
            if (value === "weekly") {
                newSchedule = { ...newSchedule, "schedule_day": "mon", "schedule_frame": null };
            }

            // default to First, Monday when user wants a monthly schedule
            if (value === "monthly") {
                newSchedule = { ...newSchedule, "schedule_frame": "first", "schedule_day": "mon" };
            }

            // when the monthly schedule frame is the 15th, clear out the schedule_day
            if (value === "mid") {
                newSchedule = { ...newSchedule, "schedule_day": null };
            }
        }

        const changedProp = { name, value };
        this.props.onScheduleChange(newSchedule, changedProp)
    }

    renderMonthlyPicker() {
        let { schedule } = this.props;

        let DAY_OPTIONS = DAY_OF_WEEK_OPTIONS.slice(0);
        DAY_OPTIONS.unshift({ name: "Calendar Day", value: null });

        return (
            <span className="mt1">
                <span className="h4 text-bold mx1">on the</span>
                <Select
                    value={_.find(MONTH_DAY_OPTIONS, (o) => o.value === schedule.schedule_frame)}
                    options={MONTH_DAY_OPTIONS}
                    optionNameFn={o => o.name}
                    className="bg-white"
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onPropertyChange("schedule_frame", o) }
                />
                { schedule.schedule_frame !== "mid" &&
                    <span className="mt1 mx1">
                        <Select
                            value={_.find(DAY_OPTIONS, (o) => o.value === schedule.schedule_day)}
                            options={DAY_OPTIONS}
                            optionNameFn={o => o.name}
                            optionValueFn={o => o.value}
                            className="bg-white"
                            onChange={(o) => this.onPropertyChange("schedule_day", o) }
                        />
                    </span>
                }
            </span>
        );
    }

    renderDayPicker() {
        let { schedule } = this.props;

        return (
            <span className="mt1">
                <span className="h4 text-bold mx1">on</span>
                <Select
                    value={_.find(DAY_OF_WEEK_OPTIONS, (o) => o.value === schedule.schedule_day)}
                    options={DAY_OF_WEEK_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    className="bg-white"
                    onChange={(o) => this.onPropertyChange("schedule_day", o) }
                />
            </span>
        );
    }

    renderHourPicker() {
        let { schedule, textBeforeSendTime } = this.props;

        let hourOfDay = isNaN(schedule.schedule_hour) ? 8 : schedule.schedule_hour;
        let hour = hourOfDay % 12;
        let amPm = hourOfDay >= 12 ? 1 : 0;
        let timezone = Settings.get("timezone_short");
        return (
            <div className="mt1">
                <span className="h4 text-bold mr1">at</span>
                <Select
                    className="mr1 bg-white"
                    value={_.find(HOUR_OPTIONS, (o) => o.value === hour)}
                    options={HOUR_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onPropertyChange("schedule_hour", o + amPm * 12) }
                />
                <Select
                    value={_.find(AM_PM_OPTIONS, (o) => o.value === amPm)}
                    options={AM_PM_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onPropertyChange("schedule_hour", hour + o * 12) }
                    className="bg-white"
                />
                { textBeforeSendTime &&
                    <div className="mt2 h4 text-bold text-grey-3 border-top pt2">
                        {textBeforeSendTime} {hour === 0 ? 12 : hour}:00 {amPm ? "PM" : "AM"} {timezone}, your Metabase timezone.
                    </div>
                }
            </div>
        );
    }

    render() {
        let { schedule, scheduleOptions } = this.props;

        const scheduleType = schedule.schedule_type;

        return (
            <div className="mt1">
                <span className="h4 text-bold mr1">Sent</span>
                <Select
                    className="h4 text-bold bg-white"
                    value={scheduleType}
                    options={scheduleOptions}
                    optionNameFn={o => capitalize(o)}
                    optionValueFn={o => o}
                    onChange={(o) => this.onPropertyChange("schedule_type", o)}
                />
                { scheduleType === "monthly" &&
                    this.renderMonthlyPicker()
                }
                { scheduleType === "weekly" &&
                    this.renderDayPicker()
                }
                { (scheduleType === "daily" || scheduleType === "weekly" || scheduleType === "monthly") &&
                    this.renderHourPicker()
                }
            </div>
        );
    }
}
