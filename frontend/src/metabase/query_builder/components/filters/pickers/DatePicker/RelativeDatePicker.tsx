/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import moment from "moment";
import { assoc } from "icepick";

import {
  formatStartingFrom,
  getRelativeDatetimeInterval,
  getStartingFrom,
  setRelativeDatetimeUnit,
  setRelativeDatetimeValue,
  setStartingFrom,
  toTimeInterval,
} from "metabase/lib/query_time";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import {
  GridContainer,
  GridText,
  MoreButton,
  OptionButton,
  OptionsContainer,
  DateUnitSelector,
  NumericInput,
} from "./RelativeDatePicker.styled";

export const PastPicker = (props: Props) => (
  <RelativeDatePicker {...props} formatter={value => value * -1} />
);

export const NextPicker = (props: Props) => (
  <RelativeDatePicker
    {...props}
    offsetFormatter={value => value * -1}
    reverseIconDirection
  />
);

const CURRENT_INTERVAL_NAME = {
  day: t`today`,
  week: t`this week`,
  month: t`this month`,
  year: t`this year`,
  quarter: t`this quarter`,
  minute: t`this minute`,
  hour: t`this hour`,
};

export const DATE_PERIODS = [
  ["day", "week", "month"],
  ["quarter", "year"],
];

const TIME_PERIODS = ["minute", "hour"];

// define ALL_PERIODS in increasing order of duration
const ALL_PERIODS = TIME_PERIODS.concat(DATE_PERIODS.flat());

const isSmallerUnit = (unit: string, unitToCompare: string) => {
  return ALL_PERIODS.indexOf(unit) < ALL_PERIODS.indexOf(unitToCompare);
};

const getStartingFromUnits = (
  filterUnit: string,
  selectedStartingFromUnit: string,
) => {
  const largerUnits = ALL_PERIODS.filter(
    period => !isSmallerUnit(period, filterUnit),
  );

  if (!largerUnits.includes(selectedStartingFromUnit)) {
    largerUnits.unshift(selectedStartingFromUnit);
  }

  return largerUnits;
};

const getCurrentString = (filter: Filter) =>
  t`Include ${getCurrentIntervalName(filter)}`;

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
  offsetFormatter: (value: number) => number;
  primaryColor?: string;
  reverseIconDirection?: boolean;
  supportsExpressions?: boolean;
};

const RelativeDatePicker: React.FC<Props> = props => {
  const {
    filter,
    onFilterChange,
    formatter = value => value,
    offsetFormatter = value => value,
    className,
    primaryColor,
    reverseIconDirection,
    supportsExpressions,
  } = props;

  const startingFrom = getStartingFrom(filter);
  const [intervals = 30, unit = "day"] = getRelativeDatetimeInterval(filter);
  const options = filter[4] || {};
  const includeCurrent = !!options["include-current"];

  const showOptions = !startingFrom;
  const numColumns = showOptions ? 3 : 4;

  const [optionsVisible, setOptionsVisible] = React.useState(false);

  const optionsContent = (
    <OptionsContainer data-testid="relative-datetime-options-container">
      {supportsExpressions && (
        <OptionButton
          icon="arrow_left_to_line"
          primaryColor={primaryColor}
          reverseIconDirection={reverseIconDirection}
          onClick={() => {
            setOptionsVisible(false);
            onFilterChange(setStartingFrom(filter));
          }}
        >
          {t`Starting from...`}
        </OptionButton>
      )}
      <OptionButton
        selected={includeCurrent}
        primaryColor={primaryColor}
        icon={includeCurrent ? "check" : "calendar"}
        onClick={() => {
          setOptionsVisible(false);
          onFilterChange(
            assoc(filter, 4, {
              ...options,
              "include-current": !includeCurrent,
            }),
          );
        }}
      >
        {getCurrentString(filter)}
      </OptionButton>
    </OptionsContainer>
  );
  return (
    <GridContainer
      className={className}
      numColumns={numColumns}
      data-testid="relative-date-picker"
    >
      {startingFrom ? (
        <GridText>{intervals < 0 ? t`Past` : t`Next`}</GridText>
      ) : null}
      <NumericInput
        className="input text-right"
        primaryColor={primaryColor}
        style={SELECT_STYLE}
        data-ui-tag="relative-date-input"
        data-testid="relative-datetime-value"
        value={typeof intervals === "number" ? Math.abs(intervals) : intervals}
        onChange={(value: number) => {
          onFilterChange(setRelativeDatetimeValue(filter, formatter(value)));
        }}
        placeholder="30"
      />
      <DateUnitSelector
        value={unit}
        primaryColor={primaryColor}
        onChange={value => {
          onFilterChange(setRelativeDatetimeUnit(filter, value));
        }}
        testId="relative-datetime-unit"
        intervals={intervals}
        formatter={formatter}
        periods={ALL_PERIODS}
      />
      {showOptions ? (
        <TippyPopover
          visible={optionsVisible}
          placement="bottom-start"
          content={optionsContent}
          onClose={() => setOptionsVisible(false)}
        >
          <MoreButton
            icon="ellipsis"
            primaryColor={primaryColor}
            onClick={() => setOptionsVisible(!optionsVisible)}
          />
        </TippyPopover>
      ) : (
        <div />
      )}
      {startingFrom ? (
        <>
          <GridText>{t`Starting from`}</GridText>
          <NumericInput
            className="input text-right"
            primaryColor={primaryColor}
            style={SELECT_STYLE}
            data-ui-tag="relative-date-input"
            data-testid="starting-from-value"
            value={
              typeof startingFrom[0] === "number"
                ? Math.abs(startingFrom[0])
                : startingFrom[0]
            }
            onChange={(value: number) =>
              onFilterChange(
                setStartingFrom(
                  filter,
                  offsetFormatter(value),
                  startingFrom[1],
                ),
              )
            }
            placeholder="30"
          />
          <DateUnitSelector
            value={startingFrom[1]}
            primaryColor={primaryColor}
            onChange={value => {
              onFilterChange(setStartingFrom(filter, startingFrom[0], value));
            }}
            formatDisplayName={(period, intervals) =>
              formatStartingFrom(period, intervals)
            }
            intervals={Math.abs(startingFrom[0])}
            formatter={formatter}
            periods={getStartingFromUnits(unit, startingFrom[1])}
            testId="starting-from-unit"
          />
          <MoreButton
            icon="close"
            primaryColor={primaryColor}
            onClick={() => {
              onFilterChange(toTimeInterval(filter));
            }}
          />
        </>
      ) : null}
    </GridContainer>
  );
};

const SELECT_STYLE = {
  width: 65,
  fontSize: 14,
  fontWeight: 700,
  padding: 8,
};
