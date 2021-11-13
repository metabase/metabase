import React from "react";
import PropTypes from "prop-types";
import DateAllOptionsWidget from "./DateAllOptionsWidget";
import moment from "moment";

const SEPARATOR = "~"; // URL-safe

function parseDateRangeValue(value) {
  const [start, end] = (value || "").split(SEPARATOR);
  return { start, end };
}

DateRangeWidget.propTypes = {
  value: PropTypes.string,
  setValue: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function DateRangeWidget({ value, ...props }) {
  const defaultedValue =
    value == null
      ? `${moment().format("YYYY-MM-DD")}~${moment().format("YYYY-MM-DD")}`
      : value;

  return (
    <DateAllOptionsWidget
      {...props}
      value={defaultedValue}
      disableOperatorSelection
    />
  );
}

DateRangeWidget.format = value => {
  const { start, end } = parseDateRangeValue(value);
  return start && end
    ? moment(start).format("MMMM D, YYYY") +
        " - " +
        moment(end).format("MMMM D, YYYY")
    : "";
};

export default DateRangeWidget;
