/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import moment, { Moment } from "moment";
import _ from "underscore";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Icon from "metabase/components/Icon";

import { Interval, ToggleButton } from "./DateOperatorFooter.styled";
import {
  getTimeComponent,
  setTimeComponent,
} from "./pickers/SpecificDatePicker";
import {
  computeFilterTimeRange,
  isStartingFrom,
} from "metabase/lib/query_time";

type Props = {
  primaryColor?: string;
  hideTimeSelectors?: boolean;

  filter: Filter;
  onFilterChange: (filter: any[]) => void;
};

const HAS_TIME_TOGGLE = ["between", "=", "<", ">"];

const TIME_SELECTOR_DEFAULT_HOUR = 12;
const TIME_SELECTOR_DEFAULT_MINUTE = 30;

const getIntervalString = (filter: Filter) => {
  const [start = moment(), end = moment()] = computeFilterTimeRange(filter);
  const formatString =
    start?.year() === end?.year() && start?.year() === moment().year()
      ? "MMM D"
      : "MMM D, YY";
  return start.format(formatString) + " - " + end.format(formatString);
};

export default function DateOperatorFooter({
  filter,
  primaryColor,
  onFilterChange,
  hideTimeSelectors,
}: Props) {
  const [operator, field, startValue, endValue] = filter;
  const { hours, minutes } = getTimeComponent(startValue);

  const enableTimeSelectors = () => {
    const start = setTimeComponent(
      startValue,
      TIME_SELECTOR_DEFAULT_HOUR,
      TIME_SELECTOR_DEFAULT_MINUTE,
    );
    let end;
    if (endValue) {
      end = setTimeComponent(
        endValue,
        TIME_SELECTOR_DEFAULT_HOUR,
        TIME_SELECTOR_DEFAULT_MINUTE,
      );
    }
    if (start) {
      onFilterChange([
        operator,
        field,
        start,
        operator === "between" && !end ? start : end,
      ]);
    }
  };

  const showTimeSelectors =
    !hideTimeSelectors &&
    typeof hours !== "number" &&
    typeof minutes !== "number";
  if (
    HAS_TIME_TOGGLE.indexOf(operator) > -1 &&
    showTimeSelectors &&
    !isStartingFrom(filter)
  ) {
    return (
      <ToggleButton
        primaryColor={primaryColor}
        onClick={enableTimeSelectors}
        icon="clock"
      >
        {t`Add a time`}
      </ToggleButton>
    );
  }

  if (operator === "time-interval" || isStartingFrom(filter)) {
    const interval = getIntervalString(filter);
    return interval ? (
      <Interval>
        <Icon className="mr1" name="calendar" />
        <div>{interval}</div>
      </Interval>
    ) : null;
  }

  return null;
}
