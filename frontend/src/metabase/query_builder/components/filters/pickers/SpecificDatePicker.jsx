import React, { Component, PropTypes } from 'react';
import { findDOMNode } from 'react-dom';

import Calendar from "metabase/components/Calendar";
import Input from "metabase/components/Input";
import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";
import Tooltip from "metabase/components/Tooltip";

import { computeFilterTimeRange } from "metabase/lib/query_time";

import moment from "moment";

export default class SpecificDatePicker extends Component {
    constructor() {
        super();

        this.state = {
            showCalendar: false,
            showTime: false,
            hours: 12,
            minutes: 30
        }

        this.onChange = this.onChange.bind(this);
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };
    componentDidMount() {
        findDOMNode(this.refs.value).focus();
    }

    onChange(val) {
        this.props.onFilterChange(["=", this.props.filter[1], val]);
    }

    render() {
        const { value } = this.props;
        const { showCalendar, showTime } = this.state;

        let start, end, startValue, endValue, singleDay;

        let initial = value || moment();

        return (
            <div className="px1">
                <div className="flex align-center mb1">
                    <div className="border-top border-bottom border-left">
                        <Input
                            className="borderless full p2 h4"
                            style={{
                                outline: 'none'
                            }}
                            value={moment(value).format("MM/DD/YYYY")}
                            onBlurChange={({ target: { value } }) =>
                                this.onChange(moment(value).format("YYYY-MM-DD"))
                            }
                            ref="value"
                        />
                    </div>
                    <div className="border-right border-bottom border-top p2">
                        <Tooltip
                            tooltip={
                                showCalendar ? "Hide calendar" : "Show calendar"
                            }
                            children={
                                <Icon
                                    className="text-purple-hover cursor-pointer"
                                    name='calendar'
                                    onClick={() => this.setState({ showCalendar: !this.state.showCalendar })}
                                />
                            }
                        />
                    </div>
                </div>
                <ExpandingContent open={showCalendar}>
                    <Calendar
                        initial={initial}
                        selected={start}
                        onChange={this.onChange}
                    />
                </ExpandingContent>

                <div className="py2 mx1">
                    { !showTime && (
                        <div
                            className="text-purple-hover cursor-pointer flex align-center"
                            onClick={() => this.setState({ showTime: !showTime }) }
                        >
                            <Icon
                                className="mr1"
                                name='clock'
                            />
                            Add a time
                        </div>
                    )}
                    { showTime && (
                        <HoursMinutes
                            clear={() => this.setState({ showTime: false }).bind(this)}
                            hours={this.state.hours}
                            minutes={this.state.minutes}
                            onChangeHours={hours => this.setState({ hours }).bind(this)}
                            onChangeMinutes={minutes => this.setState({ minutes }).bind(this)}
                        />
                    )}
                </div>
            </div>
        )
    }
}

const HoursMinutes = ({ hours, minutes, onChangeHours, onChangeMinutes, clear }) =>
    <div className="flex align-center">
        <Input
            className="input"
            defaultValue={12}
            maxLength={2}
            placeholder="12"
            value={hours}
            onChange={({ target: { value }}) => onChangeHours(value) }
        />
        <Input
            className="input"
            defaultValue={30}
            maxLength={2}
            placeholder="20"
            value={minutes}
            onChange={({ target: { value }}) => onChangeMinutes(value) }
        />
        <div className="flex align-center">
            AM
            PM
        </div>
        <Icon
            className="text-grey-2 cursor-pointer text-grey-4-hover"
            name="close"
            onClick={() => clear() }
        />
    </div>

