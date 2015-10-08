import React, { Component, PropTypes } from 'react';

import Calendar from '../../Calendar.jsx';
import { computeFilterTimeRange } from "metabase/lib/query_time";

import _ from "underscore";
import cx from "classnames";
import moment from "moment";

export default class SpecificDatePicker extends Component {
    constructor(props, context) {
        super(props, context);

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
        if (end) {
            this.props.onFilterChange(["BETWEEN", filter[1], start, end]);
        } else {
            let operator = _.contains(["=", "<", ">"], filter[0]) ? filter[0] : "=";
            this.props.onFilterChange([operator, filter[1], start]);
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

        if (start && start.isSame(end, "day")) {
            end = null;
        }

        return (
            <div>
                <div className="mx1 mt1">
                    <Calendar
                        initial={initial}
                        selected={start}
                        selectedEnd={end}
                        onChange={this.onChange}
                    />
                    <div className={cx("py1", { "disabled": filter[2] == null })}>
                        <span className={cx("inline-block text-centered text-purple-hover half py1 border-right", { "text-purple": filter[0] === "<" })} onClick={this.toggleOperator.bind(this, "<")}>&lt;&lt; All before</span>
                        <span className={cx("inline-block text-centered text-purple-hover half py1", { "text-purple": filter[0] === ">" })} onClick={this.toggleOperator.bind(this, ">")}>All after &gt;&gt;</span>
                    </div>
                </div>
            </div>
        )
    }
}
