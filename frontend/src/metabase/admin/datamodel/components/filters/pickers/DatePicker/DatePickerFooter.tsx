import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type * as React from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  computeFilterTimeRange,
  getTimeComponent,
  isStartingFrom,
  setTimeComponent,
  TIME_SELECTOR_DEFAULT_HOUR,
  TIME_SELECTOR_DEFAULT_MINUTE,
} from "metabase-lib/v1/queries/utils/query-time";

import { Container, Interval, ToggleButton } from "./DatePickerFooter.styled";

type Props = {
  hideTimeSelectors?: boolean;

  filter: Filter;
  onFilterChange: (filter: any[]) => void;
};

const HAS_TIME_TOGGLE = ["between", "=", "<", ">"];

const getIntervalString = (filter: Filter) => {
  const [start = moment(), end = moment()] = computeFilterTimeRange(filter);
  const formatString =
    start?.year() === end?.year() && start?.year() === moment().year()
      ? "MMM D"
      : "MMM D, YYYY";
  return start.format(formatString) + " - " + end.format(formatString);
};

const DatePickerFooter: React.FC<React.PropsWithChildren<Props>> = ({
  filter,
  onFilterChange,
  hideTimeSelectors,
  children,
}) => {
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

  if (
    operator === "time-interval" &&
    (startValue === "current" || startValue === null)
  ) {
    // Hide it here since "current" picker has a bunch of button shortcuts
    return null;
  }
  const showTimeSelectors =
    !hideTimeSelectors &&
    typeof hours !== "number" &&
    typeof minutes !== "number";
  let content;
  if (
    HAS_TIME_TOGGLE.indexOf(operator) > -1 &&
    showTimeSelectors &&
    !isStartingFrom(filter)
  ) {
    content = (
      <ToggleButton onClick={enableTimeSelectors} icon="clock">
        {t`Add a time`}
      </ToggleButton>
    );
  } else if (operator === "time-interval" || isStartingFrom(filter)) {
    const interval = getIntervalString(filter);
    content = interval ? (
      <Interval>
        <Icon className={CS.mr1} name="calendar" />
        <div>{interval}</div>
      </Interval>
    ) : null;
  }

  return (
    <Container>
      {content || <div />}
      {children}
    </Container>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatePickerFooter;
