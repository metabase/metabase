/* eslint-disable react/prop-types */
import React, { Component } from "react";
import cx from "classnames";

import NumericInput from "metabase/components/NumericInput";
import { formatBucketing } from "metabase/lib/query_time";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import DateUnitSelector from "../DateUnitSelector";

import { assoc } from "icepick";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import {
  CurrentButton,
  CurrentContainer,
  CurrentPopover,
  MoreButton,
  OptionButton,
  OptionsContainer,
} from "./RelativeDatePicker.styled";
import { t } from "ttag";
import moment from "moment";

export const PastPicker = (props: Props) => (
  <DatePicker {...props} formatter={value => value * -1} />
);

export const NextPicker = (props: Props) => <DatePicker {...props} />;

const periodPopoverText = (period: string) => {
  const now = moment();
  let start: string, end: string;
  switch (period) {
    case "day":
      return t`Right now, this is ${now.format("ddd, MMM D")}`;
    // return t`Right now, this is {day of week}, {three-letter month, like Nov} {number}`;
    case "week":
      start = now.startOf("week").format("ddd, MMM D");
      end = now.endOf("week").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "month":
      start = now.startOf("month").format("ddd, MMM D");
      end = now.endOf("month").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "quarter":
      start = now.startOf("quarter").format("ddd, MMM D");
      end = now.endOf("quarter").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "year":
      start = now.startOf("year").format("MMM D, YYYY");
      end = now.endOf("year").format("MMM D, YYYY");
      return t`Right now, this is ${start} - ${end}`;
  }
};

type CurrentPickerProps = {
  filter: Filter;
  primaryColor?: string;
  onCommit: (filter?: any[]) => void;
};

export function CurrentPicker(props: CurrentPickerProps) {
  const {
    primaryColor,
    onCommit,
    filter: [operator, field, intervals, unit],
  } = props;
  return (
    <CurrentContainer>
      {DATE_PERIODS.map(period => (
        <TippyPopover
          key={period}
          placement="bottom"
          content={<CurrentPopover>{periodPopoverText(period)}</CurrentPopover>}
        >
          <CurrentButton
            key={period}
            primaryColor={primaryColor}
            selected={operator && unit === period.toLowerCase()}
            onClick={() => {
              onCommit([operator, field, intervals, period]);
            }}
          >
            {formatBucketing(period, 1)}
          </CurrentButton>
        </TippyPopover>
      ))}
    </CurrentContainer>
  );
}

export const DATE_PERIODS = ["day", "week", "month", "quarter", "year"];

const TIME_PERIODS = ["minute", "hour"];

// define ALL_PERIODS in increasing order of duration
const ALL_PERIODS = TIME_PERIODS.concat(DATE_PERIODS);

const getCurrentString = (filter: Filter) =>
  t`Include ${getCurrentIntervalName(filter)}`;

const CURRENT_INTERVAL_NAME = {
  day: t`today`,
  week: t`this week`,
  month: t`this month`,
  year: t`this year`,
  minute: t`this minute`,
  hour: t`this hour`,
};

function getCurrentIntervalName(filter: Filter) {
  if (filter[0] === "time-interval") {
    return CURRENT_INTERVAL_NAME[
      filter[3] as keyof typeof CURRENT_INTERVAL_NAME
    ];
  }
  return null;
}

type Props = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  formatter: (value: number) => number;
  primaryColor?: string;
};

type State = {
  showStartingFrom: boolean;
  showOptions: boolean;
};

class DatePicker extends Component<Props, State> {
  state = {
    showStartingFrom: false,
    showOptions: false,
  };

  static defaultProps = {
    formatter: (value: string) => value,
  };

  render() {
    const {
      filter,
      onFilterChange,
      formatter,
      className,
      primaryColor,
    } = this.props;
    const { showStartingFrom, showOptions } = this.state;
    const intervals = filter[2];
    const unit = filter[3];
    const options = filter[4] || {};
    const includeCurrent = !!options["include-current"];

    const optionsContent = (
      <OptionsContainer>
        {/* <OptionButton icon="arrow_left_to_line">
          {t`Starting from...`}
        </OptionButton> */}
        <OptionButton
          selected={includeCurrent}
          primaryColor={primaryColor}
          icon={includeCurrent ? "check" : "calendar"}
          onClick={() => {
            onFilterChange(
              assoc(filter, 4, {
                ...options,
                "include-current": !includeCurrent,
              }),
            );
            this.setState({ showOptions: false });
          }}
        >
          {getCurrentString(filter)}
        </OptionButton>
      </OptionsContainer>
    );
    return (
      <div className={cx(className, "flex align-center pb1")}>
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
          onChange={(value: any) =>
            onFilterChange(assoc(filter, 2, formatter(value)))
          }
          placeholder="30"
        />
        <div className="flex-full">
          <DateUnitSelector
            value={unit}
            onChange={value => {
              onFilterChange(assoc(filter, 3, value));
            }}
            intervals={intervals}
            formatter={formatter}
            periods={ALL_PERIODS}
          />
        </div>
        {showStartingFrom ? null : (
          <TippyPopover
            visible={showOptions}
            placement={"bottom-start"}
            content={optionsContent}
          >
            <MoreButton
              icon="ellipsis"
              onClick={() => this.setState({ showOptions: !showOptions })}
            />
          </TippyPopover>
        )}
      </div>
    );
  }
}
