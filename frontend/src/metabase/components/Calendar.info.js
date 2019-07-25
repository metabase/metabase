import React from "react";
import moment from "moment";
import Calendar from "./Calendar";

export const component = Calendar;

export const description = `For when gregorian time is your need, a calendar is your friend indeed`;

// disable snapshot testing due to snapshot changing every day
export const noSnapshotTest = true;

const onChange = () => ({});

export const examples = {
  default: <Calendar onChange={onChange} />,
  "With a selected date": <Calendar onChange={onChange} selected={moment()} />,
  "With a date range": (
    <Calendar
      selected={moment()}
      selectedEnd={moment().add(10, "days")}
      onChange={onChange}
    />
  ),
};
