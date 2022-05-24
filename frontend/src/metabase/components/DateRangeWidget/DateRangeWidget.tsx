import React from "react";

import moment from "moment";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";
import { formatRangeWidget } from "metabase/parameters/utils/date-formatting";

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

DateRangeWidget.format = formatRangeWidget;

export default DateRangeWidget;
