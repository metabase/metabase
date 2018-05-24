/* @flow */

import React, { Component } from "react";

import NumericInput from "metabase/components/NumericInput.jsx";
import DateUnitSelector from "../DateUnitSelector";

import type {
  TimeIntervalFilter,
  RelativeDatetimeUnit,
} from "metabase/meta/types/Query";

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
    const {
      filter: [op, field, intervals, unit],
      onFilterChange,
      formatter,
    } = this.props;
    return (
      <div className="flex-full mb2 flex align-center">
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
          onChange={value =>
            onFilterChange([op, field, formatter(value), unit])
          }
          placeholder="30"
        />
        <div className="flex-full mr2">
          <DateUnitSelector
            open={this.state.showUnits}
            value={unit}
            onChange={value => {
              onFilterChange([op, field, intervals, value]);
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
