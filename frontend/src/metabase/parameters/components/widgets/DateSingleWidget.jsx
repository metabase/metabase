import React from "react";

import Calendar from "metabase/components/Calendar";
import moment from "moment";

const DateSingleWidget = ({ value, setValue, onClose }) => {
  value = value ? moment(value) : moment();
  return (
    <div className="p1">
      <Calendar
        initial={value}
        selected={value}
        selectedEnd={value}
        onChange={value => {
          setValue(value);
          onClose();
        }}
      />
    </div>
  );
};

DateSingleWidget.format = value =>
  value ? moment(value).format("MMMM D, YYYY") : "";

export default DateSingleWidget;
