import React from "react";

import Calendar from "metabase/components/Calendar";
import moment from "moment";

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
