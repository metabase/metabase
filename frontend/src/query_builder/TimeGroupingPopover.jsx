import React, { Component, PropTypes } from "react";

import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

import cx from "classnames";

const BUCKETINGS = [
    // "default",
    // "minute",
    "hour",
    "day",
    "week",
    "month",
    "quarter",
    "year",
    null,
    // "minute-of-hour",
    "hour-of-day",
    "day-of-week",
    // "day-of-month",
    // "day-of-year",
    "week-of-year",
    "month-of-year",
    // "quarter-of-year",
];

export default class TimeGroupingPopover extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        value: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        onFieldChange: PropTypes.func.isRequired
    };

    setField(bucketing) {
        this.props.onFieldChange(["datetime_field", this.props.value, "as", bucketing]);
    }

    render() {
        let { field } = this.props;
        return (
            <div className="p2" style={{width:"250px"}}>
                <h3 className="List-section-header mx2">Group time by</h3>
                <ul className="py1">
                { BUCKETINGS.map((bucketing, bucketingIndex) =>
                    bucketing == null ?
                        <hr style={{ "border": "none" }}/>
                    :
                        <li className={cx("List-item", { "List-item--selected": parseFieldBucketing(field) === bucketing })}>
                            <a className="List-item-title full px2 py1 cursor-pointer" onClick={this.setField.bind(this, bucketing)}>
                                {formatBucketing(bucketing)}
                            </a>
                        </li>
                )}
                </ul>
            </div>
        );
    }
}
