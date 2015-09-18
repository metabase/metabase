"use strict";

import React, { Component, PropTypes } from 'react';
import cx from 'classnames';

import Icon from 'metabase/components/Icon.react';

export default class Calendar extends Component {
    constructor(props) {
        super(props);
        let month = this.props.selected.clone();
        const modes = ['month', 'year', 'decade']
        this.state = {
            month: month,
            modes: modes,
            currentMode: modes[0]
        };
        this.previous = this.previous.bind(this);
        this.next = this.next.bind(this);
        this.cycleMode = this.cycleMode.bind(this);
    }
    cycleMode() {
        console.log('mode cycle y\'all')
        let i = ++i%this.state.modes.length;
        this.setState({
            mode: this.modes[i]
        })
    }

    previous() {
        let month = this.state.month;
        month.add(-1, "M");
        this.setState({ month: month });
    }

    next() {
        let month = this.state.month;
        month.add(1, "M");
        this.setState({ month: month });
    }

    renderMonthHeader() {
        return (
            <div className="Calendar-header flex align-center">
                <div className="bordered rounded p1 cursor-pointer transition-border border-hover px1"onClick={this.previous}>
                    <Icon name="chevronleft" width="10" height="12" />
                </div>
                <span className="flex-full" />
                <h4 className="bordered border-hover cursor-pointer rounded p1" onClick={this.cycleMode}>{this.state.month.format("MMMM YYYY")}</h4>
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
            <div className="Calendar-day-names Calendar-week border-bottom mb1">
                {names.map((name) => <span key={name} className="Calendar-day Calendar-day-name text-centered">{name}</span>)}
            </div>
        );
    }

    renderWeeks() {
        var weeks = [],
            done = false,
            date = this.state.month.clone().startOf("month").add("w" -1).day("Sunday"),
            monthIndex = date.month(),
            count = 0;

        while (!done) {
            weeks.push(
                <Week
                    key={date.toString()}
                    date={date.clone()}
                    month={this.state.month}
                    onChange={this.props.onChange}
                    selected={this.props.selected}
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
            <div className="Calendar">
                {this.renderMonthHeader()}
                {this.renderDayNames()}
                {this.renderWeeks()}
            </div>
        );
    }
}

Calendar.propTypes = {
    selected: PropTypes.object.isRequired
};

class Week extends Component {
    render() {
        let days = [];
        let { date, month } = this.props;

        for (let i = 0; i < 7; i++) {
            let classes = cx({
                'p1': true,
                'cursor-pointer': true,
                'bordered': true,
                'text-centered': true,
                "Calendar-day": true,
                "Calendar-day--today": date.isSame(new Date(), "day"),
                "Calendar-day--this-month": date.month() === month.month(),
                "Calendar-day--selected": date.isSame(this.props.selected)
            });
            days.push(
                <span key={date.toString()} className={classes} onClick={this.props.onChange.bind(null, date)}>
                    {date.date()}
                </span>
            );
            date = date.clone();
            date.add(1, "d");
        }

        return (
            <div className="Calendar-week" key={days[0].toString()}>
                {days}
            </div>
        );
    }
}

Week.defaultProps = {
    onChange: () => {}
}
