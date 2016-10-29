import React, { Component, PropTypes } from 'react';

import Calendar from "metabase/components/Calendar.jsx";
import Input from "metabase/components/Input.jsx";

import { computeFilterTimeRange } from "metabase/lib/query_time";

import _ from "underscore";
import moment from "moment";

export default class SpecificDatePicker extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            showCalendar: false
        }
        _.bindAll(this, "onChange");
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

    toggleOperator(operator) {
        if (this.props.filter[0] === operator) {
            this.props.onOperatorChange("=");
        } else {
            this.props.onOperatorChange(operator);
        }
    }

    onChange(start, end) {
        let { filter } = this.props;
        if (start && end && !moment(start).isSame(end)) {
            this.props.onFilterChange(["BETWEEN", filter[1], start, end]);
        } else {
            this.props.onFilterChange(["=", filter[1], start || end]);
        }
    }

    render() {
        let { filter } = this.props;
        let [start, end] = computeFilterTimeRange(filter);

        let initial;
        if (start && end) {
            initial = Math.abs(moment().diff(start)) < Math.abs(moment().diff(end)) ? start : end;
        } else if (start) {
            initial = start;
        }

        let singleDay = start && start.isSame(end, "day");
        if (singleDay) {
            end = null;
        }

        let startValue, startPlaceholder, endValue, endPlaceholder;
        if (filter[0] === "<") {
            startPlaceholder = "∞";
            endValue = filter[2];
        } else if (filter[0] === ">") {
            startValue = filter[2];
            endPlaceholder = "∞";
        } else if (filter[0] === "BETWEEN") {
            startValue = filter[2];
            endValue = filter[3];
        } else {
            startValue = filter[2];
            endValue = filter[2];
        }

        const { showCalendar } = this.state;
        return (
            <div className="px1">
                <Input
                    className="input full"
                    value={startValue && moment(startValue).format("MM/DD/YYYY")}
                    placeholder={startPlaceholder}
                    onBlurChange={(e) =>
                        this.onChange(moment(e.target.value).format("YYYY-MM-DD"), singleDay ? null : endValue)
                    }
                    onClick={ () => this.setState({ showCalendar: true }) }
                />
                <ExpandingContent
                    open={showCalendar}
                >
                    <Calendar
                        initial={initial}
                        selected={start}
                        selectedEnd={end}
                        onChange={this.onChange}
                        onBeforeClick={singleDay ? this.toggleOperator.bind(this, "<") : undefined}
                        onAfterClick={singleDay ? this.toggleOperator.bind(this, ">") : undefined}
                    />
                </ExpandingContent>
            </div>
        )
    }
}

const SpecificDateSelector = (props) =>
    <div>
    </div>

const ExpandingContent = ({ children, open }) =>
    <div
        style={{
            maxHeight: open ? 'none' : 0,
            overflow: 'hidden',
            transition: 'max-height 0.3s ease'
        }}
    >
        { children }
    </div>

