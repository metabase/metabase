/* eslint-disable react/prop-types */
import React, { Component, useEffect, useState } from "react";
import PropTypes from "prop-types";

import "./Calendar.css";

import cx from "classnames";
import moment from "moment";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import { usePrevious } from "metabase/hooks/use-previous";
import _ from "underscore";

const names = [t`Su`, t`Mo`, t`Tu`, t`We`, t`Th`, t`Fr`, t`Sa`];

interface CalendarProps {
  selected: any;
  selectedEnd: any;
  onChange: (selected: string, selectedEnd: string | null) => void;
  isRangePicker?: boolean;
  initial?: string;
}

export const Calendar = ({
  selected,
  selectedEnd,
  onChange,
  isRangePicker = true,
  initial,
}: CalendarProps) => {
  const [current, setCurrent] = useState<any>(initial);
  const previousSelected = usePrevious(selected);
  const previousSelectedEnd = usePrevious(selectedEnd);

  useEffect(() => {
    if (
      // `selected` became null or not null
      (selected == null) !== (previousSelected == null) ||
      // `selectedEnd` became null or not null
      (selectedEnd == null) !== (previousSelectedEnd == null) ||
      // `selected` is not null and doesn't match previous `selected`
      (selected != null && !moment(selected).isSame(previousSelected, "day")) ||
      // `selectedEnd` is not null and doesn't match previous `selectedEnd`
      (selectedEnd != null &&
        !moment(selectedEnd).isSame(previousSelectedEnd, "day"))
    ) {
      let resetCurrent = false;
      if (selected != null && selectedEnd != null) {
        // reset if `current` isn't between `selected` and `selectedEnd` month
        resetCurrent =
          selected.isAfter(current, "month") &&
          selectedEnd.isBefore(current, "month");
      } else if (selected != null) {
        // reset if `current` isn't in `selected` month
        resetCurrent =
          selected.isAfter(current, "month") ||
          selected.isBefore(current, "month");
      }
      if (resetCurrent) {
        setCurrent(selected);
      }
    }
  }, [current, previousSelected, previousSelectedEnd, selected, selectedEnd]);

  const handlePreviousMonth = () => {
    setCurrent(moment(current).add(-1, "M"));
  };

  const handleNextMonth = () => {
    setCurrent(moment(current).add(1, "M"));
  };

  const handleDaySelect = () => {
    if (!isRangePicker || !selected || selectedEnd) {
      onChange(date.format("YYYY-MM-DD"), null);
    } else if (!selectedEnd) {
      if (date.isAfter(selected)) {
        onChange(selected.format("YYYY-MM-DD"), date.format("YYYY-MM-DD"));
      } else {
        onChange(date.format("YYYY-MM-DD"), selected.format("YYYY-MM-DD"));
      }
    }
  };

  const weeks = [];
  const date = moment(current)
    .startOf("month")
    .day("Sunday");
  let done = false;
  let monthIndex = date.month();
  let count = 0;

  while (!done) {
    weeks.push(
      <Week
        key={date.toString()}
        date={moment(date)}
        month={current}
        onSelect={handleDaySelect}
        selected={selected}
        selectedEnd={selectedEnd}
      />,
    );
    date.add(1, "w");
    done = count++ > 2 && monthIndex !== date.month();
    monthIndex = date.month();
  }

  const isRange = isRangePicker && selected && selectedEnd;

  return (
    <div
      className={cx("Calendar", {
        "Calendar--range": isRange,
      })}
    >
      <div className="Calendar-header flex align-center border-bottom">
        <button
          className="cursor-pointer text-brand-hover"
          onClick={handlePreviousMonth}
        >
          <Icon name="chevronleft" size={10} />
        </button>
        <span className="flex-full" />
        <h4>{current.format("MMMM YYYY")}</h4>
        <span className="flex-full" />

        <button
          className="cursor-pointer text-brand-hover"
          onClick={handleNextMonth}
        >
          <Icon name="chevronright" size={10} />
        </button>
      </div>

      <div className="Calendar-day-names Calendar-week py1">
        {names.map(name => (
          <span key={name} className="Calendar-day-name text-centered">
            {name}
          </span>
        ))}
      </div>

      <div className="Calendar-weeks relative">{weeks}</div>
    </div>
  );
};

interface WeekProps {
  selected: any;
  selectedEnd: any;
  onSelect: (date: any) => void;
  date: any;
  month: any;
}

const Week = ({ selected, selectedEnd, onSelect, date, month }: WeekProps) => {
  return (
    <div className="Calendar-week">
      {_.range(7).map(dayIndex => {
        const day = moment(date).add(dayIndex, "d");

        const classes = cx("Calendar-day cursor-pointer text-centered", {
          "Calendar-day--today": day.isSame(new Date(), "day"),
          "Calendar-day--this-month": day.month() === month.month(),
          "Calendar-day--selected": selected && day.isSame(selected, "day"),
          "Calendar-day--selected-end":
            selectedEnd && day.isSame(selectedEnd, "day"),
          "Calendar-day--week-start": dayIndex === 0,
          "Calendar-day--week-end": dayIndex === 6,
          "Calendar-day--in-range":
            !(day.isSame(selected, "day") || day.isSame(selectedEnd, "day")) &&
            (day.isSame(selected, "day") ||
              day.isSame(selectedEnd, "day") ||
              (selectedEnd &&
                selectedEnd.isAfter(day, "day") &&
                day.isAfter(selected, "day"))),
        });

        return (
          <button
            key={day.toString()}
            className={classes}
            onClick={() => onSelect(day)}
          >
            {day.date()}
          </button>
        );
      })}
    </div>
  );
};
