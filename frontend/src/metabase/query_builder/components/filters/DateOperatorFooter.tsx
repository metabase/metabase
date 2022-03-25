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

type Props = {
  primaryColor?: string;
  hideTimeSelectors?: boolean;

  filter: Filter;
  onFilterChange: (filter: any[]) => void;
};

const HAS_TIME_TOGGLE = ["between", "=", "<", ">"];

const TIME_SELECTOR_DEFAULT_HOUR = 12;
const TIME_SELECTOR_DEFAULT_MINUTE = 30;

const getIntervalString = ([_op, _field, count, interval]: Filter) => {
  if (typeof count !== "number") {
    return null;
  }

  let start: Moment = moment();
  let end: Moment = moment();
  const formatString = "MMM D";
  let unit;
  switch (interval) {
    case "week":
      unit = "week";
      break;
    case "month":
      unit = "month";
      break;
    case "quarter":
      unit = "quarter";
      break;
    case "year":
      unit = "year";
      break;
    default:
      unit = "day";
  }
  if (count >= 0) {
    end = end.add(count, unit as moment.DurationInputArg2);
  } else {
    start = start.add(count, unit as moment.DurationInputArg2);
  }
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
  if (HAS_TIME_TOGGLE.indexOf(operator) > -1 && showTimeSelectors) {
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

  if (operator === "time-interval") {
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
