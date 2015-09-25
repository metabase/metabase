'use strict';

import React, { Component, PropTypes } from 'react';

import Calendar from '../../Calendar.react';
import { computeFilterTimeRange } from "metabase/lib/query_time";

import _ from "underscore";
import cx from "classnames";

export default class SpecificDatePicker extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "onChange");
    }

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
        if (start && start.isSame(end, "day")) {
            end = null;
        }

        return (
            <div>
                <div className="mx1 mt1">
                    <Calendar
                        selected={start}
                        selectedEnd={end}
                        onChange={this.onChange}
                    />
                    <div>
                        <span className={cx({ "text-purple": filter[0] === "<" })} onClick={this.toggleOperator.bind(this, "<")}>&lt;&lt; All before</span>
                        <span className={cx({ "text-purple": filter[0] === ">" })} onClick={this.toggleOperator.bind(this, ">")}>All after &gt;&gt;</span>
                    </div>
                </div>
            </div>
        )
    }
}

SpecificDatePicker.propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    onOperatorChange: PropTypes.func.isRequired
};
