import React from "react";

import moment from "moment";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";

const SEPARATOR = "~"; // URL-safe

function parseDateRangeValue(value: string) {
  const [start, end] = (value || "").split(SEPARATOR);
  return { start, end };
}

interface DateRangeWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
}

const DateRangeWidget = ({ value, ...props }: DateRangeWidgetProps) => {
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
};

DateRangeWidget.format = (value: string) => {
  const { start, end } = parseDateRangeValue(value);
  return start && end
    ? moment(start).format("MMMM D, YYYY") +
        " - " +
        moment(end).format("MMMM D, YYYY")
    : "";
};

export default DateRangeWidget;
