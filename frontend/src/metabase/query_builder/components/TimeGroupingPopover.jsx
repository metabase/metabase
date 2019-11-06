import React, { Component } from "react";
import PropTypes from "prop-types";

import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";
import { t } from "ttag";
import cx from "classnames";

const BUCKETINGS = [
  "default",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  null,
  "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export default class TimeGroupingPopover extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  static propTypes = {
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    onFieldChange: PropTypes.func.isRequired,
  };

  static defaultProps = {
    title: t`Group time by`,
    groupingOptions: [
      // "default",
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "quarter",
      "year",
      // "minute-of-hour",
      "hour-of-day",
      "day-of-week",
      "day-of-month",
      // "day-of-year",
      "week-of-year",
      "month-of-year",
      "quarter-of-year",
    ],
  };

  setField(bucketing) {
    this.props.onFieldChange([
      "datetime-field",
      this.props.field[1],
      bucketing,
    ]);
  }

  render() {
    const { title, field, className, groupingOptions } = this.props;
    const enabledOptions = new Set(groupingOptions);
    return (
      <div className={cx(className, "px2 py1")} style={{ width: "250px" }}>
        {title && <h3 className="List-section-header pt1 mx2">{title}</h3>}
        <ul className="py1">
          {BUCKETINGS.filter(o => o == null || enabledOptions.has(o)).map(
            (bucketing, bucketingIndex) =>
              bucketing == null ? (
                <hr key={bucketingIndex} style={{ border: "none" }} />
              ) : (
                <li
                  key={bucketingIndex}
                  className={cx("List-item", {
                    "List-item--selected":
                      parseFieldBucketing(field) === bucketing,
                  })}
                >
                  <a
                    className="List-item-title full px2 py1 cursor-pointer"
                    onClick={this.setField.bind(this, bucketing)}
                  >
                    {formatBucketing(bucketing)}
                  </a>
                </li>
              ),
          )}
        </ul>
      </div>
    );
  }
}
