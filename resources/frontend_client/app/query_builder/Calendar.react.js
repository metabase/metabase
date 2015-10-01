"use strict";

import React, { Component, PropTypes } from 'react';
import cx from 'classnames';
import moment from "moment";

import Icon from 'metabase/components/Icon.react';

const MODES = ['month', 'year', 'decade'];

export default class Calendar extends Component {
    constructor(props) {
        super(props);

        this.state = {
            current: moment(props.initial || undefined),
            currentMode: MODES[0]
        };
        this.previous = this.previous.bind(this);
        this.next = this.next.bind(this);
        this.cycleMode = this.cycleMode.bind(this);

        this.onClickDay = this.onClickDay.bind(this);
    }

    onClickDay(date, e) {
        let { selected, selectedEnd } = this.props;
        if (!selected || selectedEnd) {
            this.props.onChange(date.format("YYYY-MM-DD"), null);
        } else if (!selectedEnd) {
            if (date.isAfter(selected)) {
                this.props.onChange(selected.format("YYYY-MM-DD"), date.format("YYYY-MM-DD"));
            } else {
                this.props.onChange(date.format("YYYY-MM-DD"), selected.format("YYYY-MM-DD"));
            }
        }
    }

    cycleMode() {
        // let i = this.currentMode
        // console.log('mode cycle y\'all')
        // let i = ++i%this.state.modes.length;
        // this.setState({
        //     mode: this.modes[i]
        // })
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

    renderMonthHeader() {
        return (
            <div className="Calendar-header flex align-center">
                <div className="bordered rounded p1 cursor-pointer transition-border border-hover px1" onClick={this.previous}>
                    <Icon name="chevronleft" width="10" height="12" />
                </div>
                <span className="flex-full" />
                <h4 className="bordered border-hover cursor-pointer rounded p1" onClick={this.cycleMode}>{this.state.current.format("MMMM YYYY")}</h4>
                <span className="flex-full" />
                <div className="bordered border-hover rounded p1 transition-border cursor-pointer px1" onClick={this.next}>
                    <Icon name="chevronright" width="10" height="12" />
                </div>
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

    renderWeeks() {
        var weeks = [],
            done = false,
            date = moment(this.state.current).startOf("month").add("w" -1).day("Sunday"),
            monthIndex = date.month(),
            count = 0;

        while (!done) {
            weeks.push(
                <Week
                    key={date.toString()}
                    date={moment(date)}
                    month={this.state.current}
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
            <div className="Calendar-weeks">{weeks}</div>
        );
    }
    render() {
        return (
            <div className={cx("Calendar", { "Calendar--range": this.props.selected && this.props.selectedEnd })}>
                {this.renderMonthHeader()}
                {this.renderDayNames()}
                {this.renderWeeks()}
            </div>
        );
    }
}

Calendar.propTypes = {
    selected: PropTypes.object,
    selectedEnd: PropTypes.object,
    onChange: PropTypes.func.isRequired
};

class Week extends Component {

    _dayIsSelected(day) {
        return
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

Week.propTypes = {
    selected: PropTypes.object,
    selectedEnd: PropTypes.object,
    onClickDay: PropTypes.func.isRequired
}
