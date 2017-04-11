import React, { Component } from 'react';
import PropTypes from "prop-types";

import "./Calendar.css";

import cx from 'classnames';
import moment from 'moment';

import Icon from 'metabase/components/Icon';

export default class Calendar extends Component {
    constructor(props) {
        super(props);

        this.state = {
            current: moment(props.initial || undefined)
        };

        this.previous = this.previous.bind(this);
        this.next = this.next.bind(this);
        this.onClickDay = this.onClickDay.bind(this);
    }

    static propTypes = {
        selected: PropTypes.object,
        onChange: PropTypes.func.isRequired,
        onAfterClick: PropTypes.func,
        onBeforeClick: PropTypes.func,
        isRangePicker: PropTypes.bool,
        isDual: PropTypes.bool,
    };

    static defaultProps = {
        isRangePicker: true
    };

    componentWillReceiveProps(nextProps) {
        let resetCurrent = false;
        if (nextProps.selected && nextProps.selectedEnd) {
            resetCurrent =
                nextProps.selected.isAfter(this.state.current, "month") &&
                nextProps.selectedEnd.isBefore(this.state.current, "month");
        } else if (nextProps.selected) {
            resetCurrent =
                nextProps.selected.isAfter(this.state.current, "month") ||
                nextProps.selected.isBefore(this.state.current, "month");
        }
        if (resetCurrent) {
            this.setState({ current: nextProps.selected });
        }
    }

    onClickDay(date, e) {
        let { selected, selectedEnd, isRangePicker } = this.props;
        if (!isRangePicker || !selected || selectedEnd) {
            this.props.onChange(date.format("YYYY-MM-DD"), null);
        } else if (!selectedEnd) {
            if (date.isAfter(selected)) {
                this.props.onChange(selected.format("YYYY-MM-DD"), date.format("YYYY-MM-DD"));
            } else {
                this.props.onChange(date.format("YYYY-MM-DD"), selected.format("YYYY-MM-DD"));
            }
        }
    }

    previous() {
        let month = this.state.current;
        month.add(-1, "M");
        this.setState({ month: month });
    }

    next() {
        let month = this.state.current;
        month.add(1, "M");
        this.setState({ month: month });
    }

    renderMonthHeader(current, side) {
        return (
            <div className="Calendar-header flex align-center">
                { side !=="right" &&
                    <div className="bordered rounded p1 cursor-pointer transition-border border-hover px1" onClick={this.previous}>
                        <Icon name="chevronleft" size={10} />
                    </div>
                }
                <span className="flex-full" />
                <h4 className="cursor-pointer rounded p1">
                    {current.format("MMMM YYYY")}
                </h4>
                <span className="flex-full" />
                { side !=="left" &&
                    <div className="bordered border-hover rounded p1 transition-border cursor-pointer px1" onClick={this.next}>
                        <Icon name="chevronright" size={10} />
                    </div>
                }
            </div>
        )
    }

    renderDayNames() {
        const names = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        return (
            <div className="Calendar-day-names Calendar-week py1">
                {names.map((name) => <span key={name} className="Calendar-day-name text-centered">{name}</span>)}
            </div>
        );
    }

    renderWeeks(current) {
        var weeks = [],
            done = false,
            date = moment(current).startOf("month").add("w" -1).day("Sunday"),
            monthIndex = date.month(),
            count = 0;

        while (!done) {
            weeks.push(
                <Week
                    key={date.toString()}
                    date={moment(date)}
                    month={current}
                    onClickDay={this.onClickDay}
                    selected={this.props.selected}
                    selectedEnd={this.props.selectedEnd}
                />
            );
            date.add(1, "w");
            done = count++ > 2 && monthIndex !== date.month();
            monthIndex = date.month();
        }

        return (
            <div className="Calendar-weeks relative">
                {weeks}
            </div>
        );
    }

    renderCalender(current, side) {
        return (
            <div className={
                cx("Calendar", { "Calendar--range": this.props.selected && this.props.selectedEnd })}>
                {this.renderMonthHeader(current, side)}
                {this.renderDayNames(current)}
                {this.renderWeeks(current)}
            </div>
        );
    }

    render() {
        const { current } = this.state;
        if (this.props.isDual) {
            return (
                <div className="flex">
                    <div className="mr3">
                        {this.renderCalender(current, "left")}
                    </div>
                    {this.renderCalender(moment(current).add(1, "month"), "right")}
                </div>
            )
        } else {
            return this.renderCalender(current);
        }
    }
}

class Week extends Component {
    static propTypes = {
        selected: PropTypes.object,
        selectedEnd: PropTypes.object,
        onClickDay: PropTypes.func.isRequired
    }

    render() {
        let days = [];
        let { date, month, selected, selectedEnd } = this.props;

        for (let i = 0; i < 7; i++) {
            let classes = cx({
                'p1': true,
                'cursor-pointer': true,
                'text-centered': true,
                "Calendar-day": true,
                "Calendar-day--today": date.isSame(new Date(), "day"),
                "Calendar-day--this-month": date.month() === month.month(),
                "Calendar-day--selected": selected && date.isSame(selected, "day"),
                "Calendar-day--selected-end": selectedEnd && date.isSame(selectedEnd, "day"),
                "Calendar-day--week-start": i === 0,
                "Calendar-day--week-end": i === 6,
                "Calendar-day--in-range": !(date.isSame(selected, "day") || date.isSame(selectedEnd, "day")) && (
                    date.isSame(selected, "day") || date.isSame(selectedEnd, "day") ||
                    (selectedEnd && selectedEnd.isAfter(date, "day") && date.isAfter(selected, "day"))
                )
            });
            days.push(
                <span key={date.toString()} className={classes} onClick={this.props.onClickDay.bind(null, date)}>
                    {date.date()}
                </span>
            );
            date = moment(date);
            date.add(1, "d");
        }

        return (
            <div className="Calendar-week" key={days[0].toString()}>
                {days}
            </div>
        );
    }
}
