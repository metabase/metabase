import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';
import moment from "moment";
window.mom = moment;

import Calendar from "metabase/components/Calendar.jsx";
import Input from "metabase/components/Input.jsx";
import Popover from "metabase/components/Popover.jsx";

import { computeFilterTimeRange } from "metabase/lib/query_time";

function today() {
    return moment();
}

function parseRange(dateRange) {
    let parts = dateRange && dateRange.split("/", 1);
    console.log("parsedRange", parts);
    return {
        start: parts && parts.length > 0 && moment(parts[0]), 
        end: parts && parts.length > 1 && moment(parts[1])
    };
}


export default class ParameterDateRangePicker extends Component {

    constructor() {
        super();

        this.state = {
            isOpen: false
        };
    }

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        value: PropTypes.string,
        onChange: PropTypes.func.isRequired
    };

    onChange(start, end) {
        console.log(start, end);
        this.setState({isOpen: false});
        // let { filter } = this.props;
        // if (start && end && !moment(start).isSame(end)) {
        //     this.props.onFilterChange(["BETWEEN", filter[1], start, end]);
        // } else {
        //     this.props.onFilterChange(["=", filter[1], start || end]);
        // }
    }

    render() {
        const { parameter, value } = this.props;
        const range = (value || parameter.default) ? parseRange(value || parameter.default) : {start: today(), end: today()};
        console.log("range", range);

        // Requirements:
        // * range can be unset
        // * range can be cleared/unset when it has a value
        // * range can be relative (past 7 days, next week, yesterday)
        // * range can be absolute (apr 12 - apr 17)
        // * range can be a single day

        return (
            <div className="pt1">
                <span className="mt3 h5 text-uppercase text-grey-3 text-bold">{parameter.name}:</span>
                <span onClick={() => this.setState({isOpen: true})}>{range.start.format("YYYY-MM-DD")} / {range.end.format("YYYY-MM-DD")}</span>

                <DateRangePopover 
                    start={range.start}
                    end={range.end}
                    isOpen={this.state.isOpen}
                    onChange={this.onChange}
                    onClose={() => this.setState({isOpen: false})}
                />
            </div>
        );
    }
}


class DateRangePopover extends Component {

    constructor() {
        super();

        this.state = {};
    }

    static propTypes = {
        start: PropTypes.object.isRequired,
        end: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired,
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        isOpen: false
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(nextProps) {
        this.setState({
            start: nextProps.start,
            end: nextProps.end
        });
    }

    onChange(start, end) {
        console.log(start, end);
        // let { filter } = this.props;
        // if (start && end && !moment(start).isSame(end)) {
        //     this.props.onFilterChange(["BETWEEN", filter[1], start, end]);
        // } else {
        //     this.props.onFilterChange(["=", filter[1], start || end]);
        // }
    }

    render() {
        if (!this.props.isOpen) return null;

        const { start, end } = this.state;
        console.log(start, end);

        // let initial;
        // if (start && end) {
        //     initial = Math.abs(moment().diff(start)) < Math.abs(moment().diff(end)) ? start : end;
        // } else if (start) {
        //     initial = start;
        // }

        // let singleDay = start && start.isSame(end, "day");
        // if (singleDay) {
        //     end = null;
        // }

        // let startValue, startPlaceholder, endValue, endPlaceholder;
        // if (filter[0] === "<") {
        //     startPlaceholder = "∞";
        //     endValue = filter[2];
        // } else if (filter[0] === ">") {
        //     startValue = filter[2];
        //     endPlaceholder = "∞";
        // } else if (filter[0] === "BETWEEN") {
        //     startValue = filter[2];
        //     endValue = filter[3];
        // } else {
        //     startValue = filter[2];
        //     endValue = filter[2];
        // }

        let singleDay = false;
        //let start = null, end = null, initial = null;
        let startValue = null, endValue = null;
        let startPlaceholder = null, endPlaceholder = null;

        return (
            <Popover onClose={() => this.props.onClose()}>
                <div className="mx2 mt2">
                    <Calendar
                        selected={start}
                        selectedEnd={end}
                        onChange={(start, end) => this.onChange(start, end)}
                        //onBeforeClick={singleDay ? this.toggleOperator.bind(this, "<") : undefined}
                        //onAfterClick={singleDay ? this.toggleOperator.bind(this, ">") : undefined}
                    />
                    <div className="py2 text-centered">
                        <Input
                            className="input input--small text-bold text-grey-4 text-centered"
                            style={{width: "100px"}}
                            value={start.format("MM/DD/YYYY")}
                            onBlurChange={(e) => this.onChange(moment(e.target.value).format("YYYY-MM-DD"), singleDay ? null : endValue)}
                        />
                        <span className="px1">–</span>
                        <Input
                            className="input input--small text-bold text-grey-4 text-centered"
                            style={{width: "100px"}}
                            value={end.format("MM/DD/YYYY")}
                            onBlurChange={(e) => this.onChange(startValue, moment(e.target.value).format("YYYY-MM-DD"))}
                        />
                    </div>
                    <div className="pb2 text-centered">
                        <button className="Button Button--purple" onClick={() => this.props.onChange(this.state.start, this.state.end)}>Apply date range</button>
                    </div>
                </div>
            </Popover>
        );
    }
}
