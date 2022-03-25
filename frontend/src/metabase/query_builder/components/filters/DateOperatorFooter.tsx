/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment, { Moment } from "moment";
import _ from "underscore";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Icon from "metabase/components/Icon";

import { ToggleButton } from "./DateOperatorFooter.styled";

type Props = {
  className?: string;
  isSidebar?: boolean;
  primaryColor?: string;

  // toggleTimeSelectors: () => void;

  filter: Filter;
  onFilterChange: (filter: any[]) => void;
};

const HAS_TIME_TOGGLE = ["between", "=", "<", ">"];

const getIntervalString = ([_op, _field, count, interval]: Filter) => {
  const now: Moment = moment();
  let start: Moment = now;
  const formatString = "MMM d";
  if (count === "current") {
    let end: Moment | undefined;
    switch (interval) {
      case "week":
        start = now.startOf("week");
        end = now.endOf("week");
        break;
      case "month":
        start = now.startOf("month");
        end = now.endOf("month");
        break;
      case "quarter":
        start = now.startOf("quarter");
        end = now.endOf("quarter");
        break;
      case "year":
        start = now.startOf("year");
        end = now.endOf("year");
    }
    return end
      ? start.format(formatString) + " - " + end.format(formatString)
      : start.format(formatString);
  } else if (typeof count === "number") {
    let end: Moment = now;
    switch (interval) {
      case "day":
        start = now.startOf("day");
        end = now.endOf("day");
        break;
      case "week":
        start = now.startOf("week");
        end = now.endOf("week");
        break;
      case "month":
        start = now.startOf("month");
        end = now.endOf("month");
        break;
      case "quarter":
        start = now.startOf("quarter");
        end = now.endOf("quarter");
        break;
      case "year":
        start = now.startOf("year");
        end = now.endOf("year");
    }
    return start.format(formatString) + " - " + end.format(formatString);
  }
  return null;
};

export default function DateOperatorFooter({
  filter,
  primaryColor,
  onFilterChange,
}: // toggleTimeSelectors,
Props) {
  const [operator] = filter;
  if (HAS_TIME_TOGGLE.indexOf(operator) > -1) {
    return (
      <ToggleButton primaryColor={primaryColor}>
        <Icon className="mr1" name="clock" />
        {t`Add a time`}
      </ToggleButton>
    );
  }

  if (operator === "time-interval") {
    const interval = getIntervalString(filter);
    return interval ? (
      <div className="flex align-center text-medium">
        <Icon className="mr1" name="calendar" />
        <div>{interval}</div>
      </div>
    ) : null;
  }

  return null;
}
