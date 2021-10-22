/* eslint-disable react/prop-types */
import React from "react";
import moment from "moment";

import Calendar from "metabase/components/Calendar";

const DateSingleWidget = ({ value, setValue, onClose }) => {
  value = value ? moment(value) : moment();
  return (
    <Calendar
      initial={value}
      selected={value}
      selectedEnd={value}
      isRangePicker={false}
      onChange={value => {
        setValue(value);
        onClose();
      }}
    />
  );
};

DateSingleWidget.format = value =>
  value ? moment(value).format("MMMM D, YYYY") : "";

export default DateSingleWidget;
