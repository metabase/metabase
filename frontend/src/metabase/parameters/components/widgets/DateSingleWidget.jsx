import React from "react";
import PropTypes from "prop-types";
import DateAllOptionsWidget from "./DateAllOptionsWidget";
import moment from "moment";

DateSingleWidget.propTypes = {
  value: PropTypes.string,
  setValue: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function DateSingleWidget({ value, ...props }) {
  const defaultedValue = value == null ? moment().format("YYYY-MM-DD") : value;
  return (
    <DateAllOptionsWidget
      {...props}
      value={defaultedValue}
      disableOperatorSelection
    />
  );
}

DateSingleWidget.format = value =>
  value ? moment(value).format("MMMM D, YYYY") : "";

export default DateSingleWidget;
