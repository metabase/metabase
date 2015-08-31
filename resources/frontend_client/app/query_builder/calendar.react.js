"use strict";

import Icon from "metabase/components/Icon.react";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "Calendar",
    propTypes: {
        selected: React.PropTypes.object.isRequired
    },

    getInitialState: function() {
        return {
            month: this.props.selected.clone()
        };
    },

    previous: function() {
        var month = this.state.month;
        month.add(-1, "M");
        this.setState({ month: month });
    },

    next: function() {
        var month = this.state.month;
        month.add(1, "M");
        this.setState({ month: month });
    },

    render: function() {
        return (
            <div className="Calendar">
                {this.renderMonthHeader()}
                {this.renderDayNames()}
                {this.renderWeeks()}
            </div>
        );
    },

    renderMonthHeader: function() {
        return (
            <div className="Calendar-header flex align-center px2 mb1">
                <Icon name="chevronleft" width="10" height="12" onClick={this.previous} />
                <span className="flex-full" />
                <span className="h3 text-bold">{this.state.month.format("MMMM YYYY")}</span>
                <span className="flex-full" />
                <Icon name="chevronright" width="10" height="12" onClick={this.next} />
            </div>
        )
    },

    renderDayNames: function() {
        var names = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        return (
            <div className="Calendar-day-names Calendar-week border-bottom mb1">
                {names.map((name) => <span key={name} className="Calendar-day Calendar-day-name">{name}</span>)}
            </div>
        );
    },

    renderWeeks: function() {
        var weeks = [],
            done = false,
            date = this.state.month.clone().startOf("month").add("w" -1).day("Sunday"),
            monthIndex = date.month(),
            count = 0;

        while (!done) {
            weeks.push(<Week
                key={date.toString()}
                date={date.clone()}
                month={this.state.month}
                onChange={this.props.onChange}
                selected={this.props.selected}
            />);
            date.add(1, "w");
            done = count++ > 2 && monthIndex !== date.month();
            monthIndex = date.month();
        }

        return (
            <div className="Calendar-weeks mt1">{weeks}</div>
        );
    }
});

var Week = React.createClass({
    getDefaultProps: function() {
        return {
            onChange: () => {}
        };
    },

    render: function() {
        var days = [],
            date = this.props.date,
            month = this.props.month;

        for (var i = 0; i < 7; i++) {
            var classes = cx({
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
});
