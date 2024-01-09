/* eslint-disable react/prop-types */
import { Component } from "react";
import cx from "classnames";

import { assoc } from "icepick";
import DateUnitSelector from "../DatePicker/DateUnitSelector";

import { IntervalInput } from "./RelativeDatePicker.styled";

export const DATE_PERIODS = ["day", "week", "month", "quarter", "year"];

const TIME_PERIODS = ["minute", "hour"];

// define ALL_PERIODS in increasing order of duration
const ALL_PERIODS = TIME_PERIODS.concat(DATE_PERIODS);

export default class RelativeDatePicker extends Component {
  state = {
    showUnits: false,
  };

  static defaultProps = {
    formatter: value => value,
  };

  render() {
    const { filter, onFilterChange, formatter, className } = this.props;
    const intervals = filter[2];
    const unit = filter[3];
    return (
      <div className={cx(className, "flex align-center")}>
        <IntervalInput
          className="mr2 text-right"
          style={{
            width: 65,
            // needed to match Select's AdminSelect classes :-/
            fontSize: 14,
            fontWeight: 700,
            padding: 8,
          }}
          data-ui-tag="relative-date-input"
          value={
            typeof intervals === "number" ? Math.abs(intervals) : intervals
          }
          onChange={value => onFilterChange(assoc(filter, 2, formatter(value)))}
          placeholder="30"
        />
        <div className="flex-full">
          <DateUnitSelector
            open={this.state.showUnits}
            value={unit}
            onChange={value => {
              onFilterChange(assoc(filter, 3, value));
              this.setState({ showUnits: false });
            }}
            togglePicker={() =>
              this.setState({ showUnits: !this.state.showUnits })
            }
            intervals={intervals}
            formatter={formatter}
            periods={ALL_PERIODS}
          />
        </div>
      </div>
    );
  }
}
