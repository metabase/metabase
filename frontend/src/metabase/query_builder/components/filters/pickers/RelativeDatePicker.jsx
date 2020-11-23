/* @flow */

import React, { Component } from "react";
import cx from "classnames";

import NumericInput from "metabase/components/NumericInput";
import DateUnitSelector from "../DateUnitSelector";

import { assoc } from "icepick";

import type {
  TimeIntervalFilter,
  RelativeDatetimeUnit,
} from "metabase-types/types/Query";

export const DATE_PERIODS: RelativeDatetimeUnit[] = [
  "day",
  "week",
  "month",
  "year",
];

const TIME_PERIODS: RelativeDatetimeUnit[] = ["minute", "hour"];

const ALL_PERIODS = DATE_PERIODS.concat(TIME_PERIODS);

type Props = {
  filter: TimeIntervalFilter,
  onFilterChange: (filter: TimeIntervalFilter) => void,
  formatter: (value: any) => any,
  hideTimeSelectors?: boolean,
  className?: string,
};

type State = {
  showUnits: boolean,
};

export default class RelativeDatePicker extends Component {
  props: Props;
  state: State;

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
        <NumericInput
          className="mr2 input border-purple text-right"
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
            periods={this.props.hideTimeSelectors ? DATE_PERIODS : ALL_PERIODS}
          />
        </div>
      </div>
    );
  }
}
