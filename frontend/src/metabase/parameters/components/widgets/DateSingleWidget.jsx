import React from "react";

import Calendar from "metabase/components/Calendar.jsx";
import moment from "moment";

const DateSingleWidget = ({ value, setValue, onClose }) => (
  <div className="p1">
    <Calendar
      initial={value ? moment(value) : null}
      selected={value ? moment(value) : null}
      selectedEnd={value ? moment(value) : null}
      onChange={value => {
        setValue(value);
        onClose();
      }}
    />
  </div>
);

DateSingleWidget.format = value =>
  value ? moment(value).format("MMMM D, YYYY") : "";

export default DateSingleWidget;
