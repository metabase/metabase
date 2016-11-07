import React, { Component, PropTypes } from 'react';

import Calendar from "metabase/components/Calendar";
import Input from "metabase/components/Input";
import Icon from "metabase/components/Icon";
import ExpandingContent from "metabase/components/ExpandingContent";

import { computeFilterTimeRange } from "metabase/lib/query_time";

import moment from "moment";

export default class SpecificDatePicker extends Component {
    constructor() {
        super();

        this.state = {
            showCalendar: true,
            showTime: false,
        }

        this.onChange = this.onChange.bind(this);
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        onOperatorChange: PropTypes.func.isRequired
    };

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
                <Input
                    className="input full"
                    value={moment(value).format("MM-DD-YYYY")}
                    onBlurChange={({ target: { value } }) =>
                        this.onChange(moment(value).format("YYYY-MM-DD"))
                    }
                    onClick={ () => this.setState({ showCalendar: true }) }
                />
                <ExpandingContent open={showCalendar}>
                    <Calendar
                        initial={initial}
                        selected={start}
                        onChange={this.onChange}
                    />
                </ExpandingContent>

                <div>
                    { !showTime && (
                        <div onClick={() => this.setState({ showTime: !showTime }) }>
                            <Icon name='clock' />
                            Add a time
                        </div>
                    )}
                    { showTime && (
                        <HoursMinutes
                            hours={this.state.hours}
                            minuts={this.state.minutes}
                        />
                    )}
                </div>
            </div>
        )
    }
}

const HoursMinutes = ({ hours, minutes, onChange, clear }) =>
    <div>
        <Input
            className="borderless"
            defaultValue={12}
            placeholder="12"
            value={hours}
        />
        <Input
            className="borderless"
            defaultValue={30}
            placeholder="20"
            value={minutes}
        />
    </div>

